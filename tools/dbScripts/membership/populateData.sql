INSERT INTO roles (id, churchId, name) VALUES ('r1', 0, 'Server Admins');
INSERT INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp1', 0, id, 'MembershipApi', 'Server', 'Admin' FROM roles WHERE name='Server Admins';
INSERT INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp2', 0, id, 'MembershipApi', 'Roles', 'Edit' FROM roles WHERE name='Server Admins';
INSERT INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp3', 0, id, 'MembershipApi', 'Roles', 'View' FROM roles WHERE name='Server Admins';
INSERT INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp4', 0, id, 'MembershipApi', 'RoleMembers', 'Edit' FROM roles WHERE name='Server Admins';
INSERT INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp5', 0, id, 'MembershipApi', 'RoleMembers', 'View' FROM roles WHERE name='Server Admins';
INSERT INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp6', 0, id, 'MembershipApi', 'RolePermissions', 'Edit' FROM roles WHERE name='Server Admins';
INSERT INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp7', 0, id, 'MembershipApi', 'RolePermissions', 'View' FROM roles WHERE name='Server Admins';
INSERT INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp8', 0, id, 'MembershipApi', 'Users', 'Edit' FROM roles WHERE name='Server Admins';
INSERT INTO rolePermissions (id, churchId, roleId, apiName, contentType, action) SELECT 'rp9', 0, id, 'MembershipApi', 'Users', 'View' FROM roles WHERE name='Server Admins';
-- Demo/dev only in effect: makes demo@b1.church a Server Admin (applyUniversal merges church-0 perms into every church JWT) so serverAdmin + commons admin surfaces are e2e-testable. No-op when the demo user doesn't exist.
INSERT INTO roleMembers (id, churchId, roleId, userId, dateAdded) SELECT 'rm1', 0, r.id, u.id, NOW() FROM roles r, users u WHERE r.name='Server Admins' AND r.churchId=0 AND u.email='demo@b1.church';
