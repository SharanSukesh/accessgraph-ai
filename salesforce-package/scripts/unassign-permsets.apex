// Remove all assignments of the AccessGraph AI Admin permission set
// so the managed package can be uninstalled cleanly.
List<PermissionSetAssignment> psas = [
    SELECT Id
    FROM PermissionSetAssignment
    WHERE PermissionSet.Name = 'AccessGraph_Admin'
       OR PermissionSet.Label = 'AccessGraph AI Admin'
];
System.debug('Found ' + psas.size() + ' assignment(s) to delete');
if (!psas.isEmpty()) {
    delete psas;
}
