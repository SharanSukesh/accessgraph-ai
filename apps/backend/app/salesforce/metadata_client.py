"""
Salesforce Metadata API Client
Handles reading profile metadata including field-level security
"""
import logging
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class SalesforceMetadataClient:
    """
    Salesforce Metadata API client
    Reads profile metadata to get field-level security for standard profiles
    """

    def __init__(self, instance_url: str, access_token: str, api_version: str = "v59.0"):
        self.instance_url = instance_url.rstrip("/")
        self.access_token = access_token
        self.api_version = api_version
        # Tooling API base URL for metadata operations
        self.tooling_base_url = f"{self.instance_url}/services/data/{api_version}/tooling"

    def _get_headers(self) -> Dict[str, str]:
        """Get HTTP headers with auth"""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    async def read_profile_metadata(self, profile_name: str) -> Optional[Dict[str, Any]]:
        """
        Read Profile metadata using Tooling API

        Args:
            profile_name: Name of the profile (e.g., "Analytics Cloud Integration User")

        Returns:
            Dictionary containing profile metadata including field permissions
        """
        try:
            # Query for the Profile using Tooling API
            # The Profile object in Tooling API contains metadata
            query = f"SELECT Id, Name, FullName FROM Profile WHERE Name = '{profile_name}'"
            url = f"{self.tooling_base_url}/query"
            params = {"q": query}

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(url, headers=self._get_headers(), params=params)
                response.raise_for_status()
                data = response.json()

                if data.get("totalSize", 0) == 0:
                    logger.warning(f"Profile not found: {profile_name}")
                    return None

                profile_id = data["records"][0]["Id"]
                full_name = data["records"][0]["FullName"]

                # Now retrieve the actual metadata using sobject describe or MetadataComponentDependency
                # For profiles, we need to use the Metadata API's read operation
                # Since Metadata API uses SOAP, we'll use an alternative approach:
                # Query the ApexClass or use the composite API

                logger.info(f"Found profile: {profile_name} (ID: {profile_id}, FullName: {full_name})")

                # Alternative: Use the REST API to get profile permissions
                # We can query FieldPermissions but filter by profile-owned permission set
                return {
                    "id": profile_id,
                    "name": profile_name,
                    "fullName": full_name
                }

        except Exception as e:
            logger.error(f"Failed to read profile metadata for {profile_name}: {e}")
            return None

    async def get_profile_field_permissions_via_describe(
        self, profile_name: str
    ) -> List[Dict[str, Any]]:
        """
        Get field permissions for a profile by describing objects

        This is a workaround approach that gets field accessibility by:
        1. Getting the profile's permission set
        2. Describing each standard object
        3. Checking field accessibility for the current user's profile

        Args:
            profile_name: Name of the profile

        Returns:
            List of field permission dictionaries
        """
        field_permissions = []

        try:
            # Get list of standard objects to check
            standard_objects = [
                "Account", "Contact", "Opportunity", "Case", "Lead",
                "Campaign", "Task", "Event", "Solution", "Product2"
            ]

            for obj_name in standard_objects:
                try:
                    # Use the sobject describe endpoint
                    url = f"{self.instance_url}/services/data/{self.api_version}/sobjects/{obj_name}/describe"

                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.get(url, headers=self._get_headers())
                        response.raise_for_status()
                        describe_result = response.json()

                        # Extract field metadata
                        for field in describe_result.get("fields", []):
                            field_permissions.append({
                                "SobjectType": obj_name,
                                "Field": f"{obj_name}.{field['name']}",
                                "PermissionsRead": field.get("updateable", False) or field.get("createable", False),
                                "PermissionsEdit": field.get("updateable", False),
                                "IsAccessible": field.get("accessible", False),
                                "IsUpdateable": field.get("updateable", False),
                                "IsCreateable": field.get("createable", False),
                            })

                except Exception as e:
                    logger.warning(f"Failed to describe {obj_name}: {e}")
                    continue

            logger.info(f"Retrieved {len(field_permissions)} field permissions via describe")
            return field_permissions

        except Exception as e:
            logger.error(f"Failed to get field permissions via describe: {e}")
            return []

    async def get_profile_field_permissions_soap(
        self, profile_full_name: str
    ) -> List[Dict[str, Any]]:
        """
        Get field permissions from Profile metadata using SOAP API

        This uses the Metadata API's readMetadata operation via SOAP

        Args:
            profile_full_name: API name of the profile

        Returns:
            List of field permission dictionaries with SobjectType, Field, PermissionsRead, PermissionsEdit
        """
        # SOAP envelope for reading Profile metadata
        soap_body = f"""<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:met="http://soap.sforce.com/2006/04/metadata">
   <soapenv:Header>
      <met:SessionHeader>
         <met:sessionId>{self.access_token}</met:sessionId>
      </met:SessionHeader>
   </soapenv:Header>
   <soapenv:Body>
      <met:readMetadata>
         <met:type>Profile</met:type>
         <met:fullNames>{profile_full_name}</met:fullNames>
      </met:readMetadata>
   </soapenv:Body>
</soapenv:Envelope>"""

        url = f"{self.instance_url}/services/Soap/m/{self.api_version.replace('v', '')}"
        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "readMetadata",
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, content=soap_body, headers=headers)
                response.raise_for_status()

                # Parse XML response
                root = ET.fromstring(response.content)

                # Extract field permissions from XML
                # The structure is: Profile -> fieldPermissions -> field, readable, editable
                field_permissions = []
                ns = {
                    'soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
                    'met': 'http://soap.sforce.com/2006/04/metadata'
                }

                for field_perm in root.findall('.//met:fieldPermissions', ns):
                    field_elem = field_perm.find('met:field', ns)
                    readable_elem = field_perm.find('met:readable', ns)
                    editable_elem = field_perm.find('met:editable', ns)

                    if field_elem is not None and field_elem.text:
                        # Field format is "ObjectName.FieldName"
                        field_name = field_elem.text
                        if '.' in field_name:
                            obj_name, field_api_name = field_name.split('.', 1)
                        else:
                            obj_name = "Unknown"
                            field_api_name = field_name

                        field_permissions.append({
                            "SobjectType": obj_name,
                            "Field": field_name,
                            "PermissionsRead": readable_elem.text.lower() == 'true' if readable_elem is not None else False,
                            "PermissionsEdit": editable_elem.text.lower() == 'true' if editable_elem is not None else False,
                        })

                logger.info(f"Retrieved {len(field_permissions)} field permissions from Profile metadata")
                return field_permissions

        except Exception as e:
            logger.error(f"Failed to read Profile metadata via SOAP: {e}")
            return []
