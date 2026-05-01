"""
One-time script to fix existing NULL group names in production database.
This should be run once after deployment to clean up existing data.
"""
import asyncio
from sqlalchemy import select, update
from app.db.session import AsyncSessionLocal
from app.domain.models import GroupSnapshot


async def fix_null_group_names():
    """Update all group snapshots with NULL names to have descriptive fallback names"""

    print("=" * 60)
    print("Fixing NULL Group Names in Database")
    print("=" * 60)

    async with AsyncSessionLocal() as session:
        # Find all groups with NULL names
        stmt = select(GroupSnapshot).where(GroupSnapshot.name.is_(None))
        result = await session.execute(stmt)
        groups_with_null_names = result.scalars().all()

        if not groups_with_null_names:
            print("\n✓ No groups with NULL names found!")
            print("Database is clean.\n")
            return

        print(f"\nFound {len(groups_with_null_names)} groups with NULL names")
        print("Updating them with descriptive fallback names...\n")

        updated_count = 0
        for group in groups_with_null_names:
            # Generate fallback name
            group_type = group.group_type or "Unknown"
            group_id = group.salesforce_id[:8] if group.salesforce_id else "NoID"
            fallback_name = f"{group_type} Group ({group_id})"

            # Update the group
            group.name = fallback_name
            updated_count += 1

            print(f"  {updated_count}. Updated group {group.salesforce_id} -> '{fallback_name}'")

        # Commit all changes
        await session.commit()

        print(f"\n✓ Successfully updated {updated_count} groups")
        print("=" * 60)
        print("Database cleanup complete!")
        print("=" * 60)
        print("\nYou can now run syncs without NULL constraint errors.\n")


if __name__ == "__main__":
    asyncio.run(fix_null_group_names())
