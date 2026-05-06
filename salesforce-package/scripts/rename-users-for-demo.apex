// Rename scratch-org users to realistic demo identities for AppExchange
// listing screenshots. Skips system users (Automated Process / Platform
// Integration / Security User / etc.) to avoid breaking platform behavior.
//
// Run with: sf apex run --file scripts/rename-users-for-demo.apex --target-org <alias>

List<User> usersToRename = [
    SELECT Id, Username, FirstName, LastName, Email, Alias
    FROM User
    WHERE IsActive = true
    AND UserType = 'Standard'
    ORDER BY CreatedDate ASC
];

System.debug('Found ' + usersToRename.size() + ' standard users to rename.');

// Realistic demo identities - varied teams (sales, ops, finance, eng, support)
List<List<String>> demoIdentities = new List<List<String>>{
    new List<String>{ 'Sarah',   'Johnson',   'sarah.johnson@acme-demo.com',   'sjohnson' },
    new List<String>{ 'David',   'Chen',      'david.chen@acme-demo.com',      'dchen'    },
    new List<String>{ 'Priya',   'Patel',     'priya.patel@acme-demo.com',     'ppatel'   },
    new List<String>{ 'Marcus',  'Rivera',    'marcus.rivera@acme-demo.com',   'mrivera'  },
    new List<String>{ 'Emily',   'Williams',  'emily.williams@acme-demo.com',  'ewillia'  },
    new List<String>{ 'James',   'OBrien',    'james.obrien@acme-demo.com',    'jobrien'  },
    new List<String>{ 'Aisha',   'Khan',      'aisha.khan@acme-demo.com',      'akhan'    },
    new List<String>{ 'Tom',     'Anderson',  'tom.anderson@acme-demo.com',    'tanders'  },
    new List<String>{ 'Lisa',    'Park',      'lisa.park@acme-demo.com',       'lpark'    },
    new List<String>{ 'Carlos',  'Mendez',    'carlos.mendez@acme-demo.com',   'cmendez'  },
    new List<String>{ 'Nina',    'Schmidt',   'nina.schmidt@acme-demo.com',    'nschmid'  },
    new List<String>{ 'Raj',     'Kumar',     'raj.kumar@acme-demo.com',       'rkumar'   }
};

Integer renamed = 0;
for (Integer i = 0; i < usersToRename.size() && i < demoIdentities.size(); i++) {
    User u = usersToRename[i];
    List<String> demo = demoIdentities[i];

    // Skip the org's primary admin - we still need to log in as them
    if (u.Username == UserInfo.getUserName()) {
        System.debug('Skipping current user (admin): ' + u.Username);
        continue;
    }

    u.FirstName = demo[0];
    u.LastName  = demo[1];
    u.Email     = demo[2];
    u.Alias     = demo[3];
    renamed++;
}

if (renamed > 0) {
    update usersToRename;
    System.debug('Renamed ' + renamed + ' user(s) to demo identities.');
} else {
    System.debug('No users renamed.');
}

// Show final state
for (User u : [SELECT Username, FirstName, LastName, Email FROM User WHERE IsActive = true AND UserType = 'Standard' ORDER BY LastName]) {
    System.debug('  ' + u.FirstName + ' ' + u.LastName + ' <' + u.Email + '>');
}
