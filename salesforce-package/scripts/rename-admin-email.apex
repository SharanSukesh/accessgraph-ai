// Rename the current admin user's display email to a demo identity.
// Keeps the Username and password intact (those are what you log in with);
// only changes the Email/Name/Alias fields shown in the UI.

User admin = [SELECT Id, Username, FirstName, LastName, Email FROM User WHERE Username = :UserInfo.getUserName() LIMIT 1];

System.debug('Before: ' + admin.FirstName + ' ' + admin.LastName + ' <' + admin.Email + '>');

admin.FirstName = 'Sarah';
admin.LastName  = 'Johnson';
admin.Email     = 'sarah.johnson@acme-demo.com';
admin.Alias     = 'sjohns';
update admin;

System.debug('After:  ' + admin.FirstName + ' ' + admin.LastName + ' <' + admin.Email + '>');
System.debug('Login is still: ' + admin.Username + ' (unchanged)');
