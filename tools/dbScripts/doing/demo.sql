DROP PROCEDURE IF EXISTS resetDemoData;

-- Create stored procedure to reset demo data
DELIMITER //
CREATE PROCEDURE resetDemoData()
BEGIN

    -- This script should be run AFTER the tables are created
    -- Run initdb.ts first to create the tables, then run this script

    -- Truncate all tables in correct order (respecting foreign key constraints)
    SET FOREIGN_KEY_CHECKS = 0;
    TRUNCATE TABLE assignments;
    TRUNCATE TABLE blockoutDates;
    TRUNCATE TABLE notes;
    TRUNCATE TABLE planItems;
    TRUNCATE TABLE plans;
    TRUNCATE TABLE planTypes;
    TRUNCATE TABLE positions;
    TRUNCATE TABLE times;
    TRUNCATE TABLE tasks;
    TRUNCATE TABLE conditions;
    TRUNCATE TABLE automations;
    TRUNCATE TABLE actions;
    SET FOREIGN_KEY_CHECKS = 1;

    -- Create automation for birthday cards (must be created before tasks that reference it)
    INSERT INTO automations (id, churchId, title, recurs, active) VALUES
    ('AUT00000001', 'CHU00000001', 'Birthday Card Automation', 'Daily', b'1');

    -- Create conditions for the birthday automation
    INSERT INTO conditions (id, churchId, conjunctionId, field, fieldData, operator, value, label) VALUES
    ('CON00000001', 'CHU00000001', 'AUT00000001', 'status', '{"type": "member"}', 'equals', 'Active', 'Member Status is Active'),
    ('CON00000002', 'CHU00000001', 'AUT00000001', 'age', '{"type": "member"}', 'greaterThan', '18', 'Member Age is over 18');

    -- Create actions for the birthday automation
    INSERT INTO actions (id, churchId, automationId, actionType, actionData) VALUES
    ('ACT00000001', 'CHU00000001', 'AUT00000001', 'CreateTask', '{"assignedTo": "PER00000069", "title": "Send Birthday Card to {memberName}", "description": "Send birthday card to {memberName} for their birthday on {birthday}. Address: {address}", "dueDate": "{birthday}", "daysBeforeDue": 7, "sortOrder": 1}');

    -- Create Plan Types
    INSERT INTO planTypes (id, churchId, ministryId, name) VALUES
    ('PLT00000001', 'CHU00000001', 'GRP0000000a', 'Sunday Service'),
    ('PLT00000002', 'CHU00000001', 'GRP0000000a', 'Wednesday Night Service'),
    ('PLT00000003', 'CHU00000001', 'GRP0000000a', 'Special Event'),
    ('PLT00000004', 'CHU00000001', 'GRP0000000a', 'Youth Service'),
    ('PLT00000005', 'CHU00000001', 'GRP0000000a', 'Prayer Meeting');

    -- Create Worship Ministry Positions
    INSERT INTO positions (id, churchId, planId, categoryName, name, count, groupId) VALUES
    -- Sunday Morning Service Positions
    ('POS00000001', 'CHU00000001', 'PLA00000001', 'Worship', 'Worship Leader', 1, 'GRP0000000b'),
    ('POS00000002', 'CHU00000001', 'PLA00000001', 'Worship', 'Acoustic Guitar', 1, 'GRP0000000b'),
    ('POS00000003', 'CHU00000001', 'PLA00000001', 'Worship', 'Electric Guitar', 1, 'GRP0000000b'),
    ('POS00000004', 'CHU00000001', 'PLA00000001', 'Worship', 'Bass Guitar', 1, 'GRP0000000b'),
    ('POS00000005', 'CHU00000001', 'PLA00000001', 'Worship', 'Drums', 1, 'GRP0000000b'),
    ('POS00000006', 'CHU00000001', 'PLA00000001', 'Worship', 'Keyboard', 1, 'GRP0000000b'),
    ('POS00000007', 'CHU00000001', 'PLA00000001', 'Worship', 'Vocals', 1, 'GRP0000000b'),
    ('POS00000008', 'CHU00000001', 'PLA00000001', 'Technical', 'Sound Tech', 1, 'GRP0000000b'),
    ('POS00000009', 'CHU00000001', 'PLA00000001', 'Technical', 'Projection Tech', 1, 'GRP0000000b'),
    ('POS00000010', 'CHU00000001', 'PLA00000001', 'Hospitality', 'Greeter', 1, 'GRP0000000b'),
    ('POS00000011', 'CHU00000001', 'PLA00000001', 'Hospitality', 'Usher', 1, 'GRP0000000b');

    -- Create Service Times
    INSERT INTO times (id, churchId, planId, displayName, startTime, endTime, teams) VALUES
    ('TIM00000001', 'CHU00000001', NULL, 'Sunday Morning Service', 
     DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (7 - DAYOFWEEK(CURDATE())) DAY), INTERVAL 10 HOUR), 
     DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (7 - DAYOFWEEK(CURDATE())) DAY), INTERVAL 11.5 HOUR), 'Worship,Technical'),
    ('TIM00000002', 'CHU00000001', NULL, 'Thursday Practice', 
     DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (5 - DAYOFWEEK(CURDATE())) DAY), INTERVAL 19 HOUR), 
     DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (5 - DAYOFWEEK(CURDATE())) DAY), INTERVAL 21 HOUR), 'Worship,Technical');

    -- Create Worship Plans
    INSERT INTO plans (id, churchId, ministryId, planTypeId, name, serviceDate, notes, serviceOrder, contentType, contentId) VALUES
    ('PLA00000001', 'CHU00000001', 'GRP0000000a', 'PLT00000001', 'Upcoming Worship Schedule', 
     DATE_ADD(CURDATE(), INTERVAL (7 - DAYOFWEEK(CURDATE())) DAY), 
     'Upcoming worship services including special seasonal service', 1, 'lesson', 'LES12345678');

    -- Create Plan Items
    INSERT INTO planItems (id, churchId, planId, parentId, sort, itemType, relatedId, label, description, seconds, link) VALUES
    -- Week 1 (March 3)
    ('PLI00000001', 'CHU00000001', 'PLA00000001', NULL, 1, 'header', NULL, 'Countdown Video', '', 0, NULL),
    ('PLI00000002', 'CHU00000001', 'PLA00000001', 'PLI00000001', 1, 'item', NULL, 'Countdown Video', '', 600, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ('PLI00000003', 'CHU00000001', 'PLA00000001', 'PLI00000001', 2, 'item', NULL, 'Welcome and Opening Prayer', 'John leads', 120, NULL),

    -- Worship Section
    ('PLI00000004', 'CHU00000001', 'PLA00000001', NULL, 2, 'header', NULL, 'Worship', '', 0, NULL),
    ('PLI00000005', 'CHU00000001', 'PLA00000001', 'PLI00000004', 1, 'arrangementKey', 'ARK00000001', 'What a Beautiful Name', 'Key of B', 360, 'https://www.youtube.com/watch?v=nQWFzMvCfLE'),
    ('PLI00000006', 'CHU00000001', 'PLA00000001', 'PLI00000004', 2, 'arrangementKey', 'ARK00000003', 'Good Good Father', 'Key of G', 345, 'https://www.youtube.com/watch?v=djH8_mpYgp8'),
    ('PLI00000007', 'CHU00000001', 'PLA00000001', 'PLI00000004', 3, 'arrangementKey', 'ARK00000007', 'Build My Life', 'Key of E', 355, 'https://www.youtube.com/watch?v=HhKaEuB4DQY'),
    ('PLI00000008', 'CHU00000001', 'PLA00000001', 'PLI00000004', 4, 'item', NULL, 'Prayer and Offering', 'Michael leads prayer', 180, NULL),

    -- Scripture and Sermon Section
    ('PLI00000009', 'CHU00000001', 'PLA00000001', NULL, 3, 'header', NULL, 'Scripture and Sermon', '', 0, NULL),
    ('PLI00000010', 'CHU00000001', 'PLA00000001', 'PLI00000009', 1, 'item', NULL, 'Scripture Reading', 'Matthew 5:1-12 - The Beatitudes', 120, 'https://www.biblegateway.com/passage/?search=Matthew%205:1-12&version=NIV'),
    ('PLI00000011', 'CHU00000001', 'PLA00000001', 'PLI00000009', 2, 'item', NULL, 'Sermon:', 'Pastor John - Living the Beatitudes', 1800, 'https://example.com/sermon-notes/beatitudes'),

    -- Communion Section
    ('PLI00000012', 'CHU00000001', 'PLA00000001', NULL, 4, 'header', NULL, 'Communion', '', 0, NULL),
    ('PLI00000013', 'CHU00000001', 'PLA00000001', 'PLI00000012', 1, 'item', NULL, 'Communion Preparation', 'Pastor explains communion', 120, NULL),
    ('PLI00000014', 'CHU00000001', 'PLA00000001', 'PLI00000012', 2, 'arrangementKey', 'ARK00000011', 'Amazing Grace', 'Key of G - during communion', 300, 'https://www.youtube.com/watch?v=CDdvReNKKuk'),
    ('PLI00000015', 'CHU00000001', 'PLA00000001', 'PLI00000012', 3, 'item', NULL, 'Communion Distribution', 'Deacons serve', 600, NULL),

    -- Closing Section
    ('PLI00000016', 'CHU00000001', 'PLA00000001', NULL, 5, 'header', NULL, 'Closing', '', 0, NULL),
    ('PLI00000017', 'CHU00000001', 'PLA00000001', 'PLI00000016', 1, 'arrangementKey', 'ARK00000009', 'Graves Into Gardens', 'Key of F# - closing song', 365, 'https://www.youtube.com/watch?v=37qjuS4zMpY'),
    ('PLI00000018', 'CHU00000001', 'PLA00000001', 'PLI00000016', 2, 'item', NULL, 'Announcements', 'Weekly announcements', 180, 'https://example.com/weekly-announcements'),
    ('PLI00000019', 'CHU00000001', 'PLA00000001', 'PLI00000016', 3, 'item', NULL, 'Benediction', 'Pastor John gives blessing', 60, NULL),
    ('PLI00000020', 'CHU00000001', 'PLA00000001', 'PLI00000016', 4, 'item', NULL, 'Postlude', 'Instrumental music as people leave', 300, NULL);


    -- Create Assignments
    INSERT INTO assignments (id, churchId, positionId, personId, status, notified) VALUES
    ('ASS00000001', 'CHU00000001', 'POS00000001', 'PER00000027', 'Accepted', DATE_SUB(NOW(), INTERVAL 7 DAY)), -- Michael Davis (Worship Leader)
    ('ASS00000002', 'CHU00000001', 'POS00000002', 'PER00000042', 'Accepted', DATE_SUB(NOW(), INTERVAL 7 DAY)), -- David Lopez (Acoustic Guitar)
    ('ASS00000003', 'CHU00000001', 'POS00000003', 'PER00000054', 'Accepted', DATE_SUB(NOW(), INTERVAL 7 DAY)), -- William Anderson (Electric Guitar)
    ('ASS00000004', 'CHU00000001', 'POS00000004', 'PER00000021', 'Accepted', DATE_SUB(NOW(), INTERVAL 7 DAY)), -- Carlos Garcia (Bass)
    ('ASS00000005', 'CHU00000001', 'POS00000005', 'PER00000036', 'Accepted', DATE_SUB(NOW(), INTERVAL 7 DAY)), -- Miguel Hernandez (Drums)
    ('ASS00000006', 'CHU00000001', 'POS00000006', 'PER00000028', 'Accepted', DATE_SUB(NOW(), INTERVAL 7 DAY)), -- Emily Davis (Keyboard)
    ('ASS00000007', 'CHU00000001', 'POS00000007', 'PER00000022', 'Accepted', DATE_SUB(NOW(), INTERVAL 7 DAY)), -- Maria Garcia (Vocals)
    ('ASS00000008', 'CHU00000001', 'POS00000008', 'PER00000082', 'Accepted', DATE_SUB(NOW(), INTERVAL 7 DAY)); -- Demo user (Sound Tech)

    -- Create Blockout Dates
    INSERT INTO blockoutDates (id, churchId, personId, startDate, endDate) VALUES
    ('BLK00000001', 'CHU00000001', 'PER00000027', DATE_ADD(CURDATE(), INTERVAL 7 DAY), DATE_ADD(CURDATE(), INTERVAL 12 DAY)), -- Michael Davis
    ('BLK00000002', 'CHU00000001', 'PER00000042', DATE_ADD(CURDATE(), INTERVAL 14 DAY), DATE_ADD(CURDATE(), INTERVAL 16 DAY)), -- David Lopez
    ('BLK00000003', 'CHU00000001', 'PER00000054', DATE_SUB(CURDATE(), INTERVAL 5 DAY), DATE_SUB(CURDATE(), INTERVAL 3 DAY)), -- William Anderson
    ('BLK00000004', 'CHU00000001', 'PER00000021', DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_SUB(CURDATE(), INTERVAL 8 DAY)), -- Carlos Garcia
    ('BLK00000005', 'CHU00000001', 'PER00000036', DATE_ADD(CURDATE(), INTERVAL 21 DAY), DATE_ADD(CURDATE(), INTERVAL 23 DAY)), -- Miguel Hernandez
    ('BLK00000006', 'CHU00000001', 'PER00000082', DATE_ADD(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 13 DAY)), -- Demo user - vacation
    ('BLK00000007', 'CHU00000001', 'PER00000082', DATE_ADD(CURDATE(), INTERVAL 28 DAY), DATE_ADD(CURDATE(), INTERVAL 29 DAY)); -- Demo user - conference

    -- Create Notes
    INSERT INTO notes (id, churchId, contentType, contentId, noteType, addedBy, createdAt, updatedAt, contents) VALUES
    ('NOT00000001', 'CHU00000001', 'assignment', 'ASS00000001', 'General', 'PER00000027', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), 'Please prepare 4 songs for upcoming service'),
    ('NOT00000002', 'CHU00000001', 'assignment', 'ASS00000062', 'General', 'PER00000027', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 'Special seasonal service - need 6 songs including traditional hymns'),
    ('NOT00000003', 'CHU00000001', 'assignment', 'ASS00000015', 'Technical', 'PER00000075', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), 'New microphone setup for upcoming service'),
    ('NOT00000004', 'CHU00000001', 'assignment', 'ASS00000071', 'Hospitality', 'PER00000068', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_SUB(NOW(), INTERVAL 12 HOUR), 'Extra greeters needed for special service');

    -- Create sample tasks (after automations are created)
    INSERT INTO tasks (id, churchId, taskNumber, taskType, dateCreated, dateClosed, associatedWithType, associatedWithId, associatedWithLabel, createdByType, createdById, createdByLabel, assignedToType, assignedToId, assignedToLabel, title, status, automationId, conversationId, data) VALUES
    -- Visitor Follow-up Tasks
    ('TSK00000001', 'CHU00000001', 1, 'FollowUp', DATE_SUB(NOW(), INTERVAL 2 DAY), NULL, 'Person', 'PER00000001', 'John Smith', 'Person', 'PER00000027', 'Michael Davis', 'Person', 'PER00000068', 'Kevin Martin', 'Invite New Visitor to Lunch', 'Pending', NULL, NULL, CONCAT('{"description": "Follow up with John Smith who visited recently", "dueDate": "', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), '%Y-%m-%d'), '"}')),
    ('TSK00000002', 'CHU00000001', 2, 'FollowUp', DATE_SUB(NOW(), INTERVAL 2 DAY), NULL, 'Family', 'FAM00000001', 'Johnson Family', 'Person', 'PER00000027', 'Michael Davis', 'Person', 'PER00000069', 'Rachel Martin', 'Send Welcome Package', 'Pending', NULL, NULL, CONCAT('{"description": "Mail welcome package to the Johnson family", "dueDate": "', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '%Y-%m-%d'), '"}')),
    ('TSK00000003', 'CHU00000001', 3, 'FollowUp', DATE_SUB(NOW(), INTERVAL 2 DAY), NULL, 'Person', 'PER00000002', 'Maria Rodriguez', 'Person', 'PER00000027', 'Michael Davis', 'Person', 'PER00000075', 'Steven White', 'Schedule New Member Class', 'Pending', NULL, NULL, CONCAT('{"description": "Contact Maria Rodriguez about next new member class", "dueDate": "', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 5 DAY), '%Y-%m-%d'), '"}')),

    -- Ministry Support Tasks
    ('TSK00000004', 'CHU00000001', 4, 'Ministry', DATE_SUB(NOW(), INTERVAL 5 DAY), NULL, 'Ministry', 'MIN00000001', 'Communion Ministry', 'Person', 'PER00000027', 'Michael Davis', 'Person', 'PER00000076', 'Melissa White', 'Order Communion Supplies', 'Pending', NULL, NULL, CONCAT('{"description": "Order new communion cups and juice for next month", "dueDate": "', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 12 DAY), '%Y-%m-%d'), '"}')),
    ('TSK00000005', 'CHU00000001', 5, 'Ministry', DATE_SUB(NOW(), INTERVAL 5 DAY), NULL, 'Ministry', 'MIN00000002', 'Worship Ministry', 'Person', 'PER00000027', 'Michael Davis', 'Person', 'PER00000027', 'Michael Davis', 'Update Worship Song List', 'Pending', NULL, NULL, CONCAT('{"description": "Update the song database with new seasonal songs", "dueDate": "', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 17 DAY), '%Y-%m-%d'), '"}')),

    -- Pastoral Care Tasks
    ('TSK00000006', 'CHU00000001', 6, 'Care', DATE_SUB(NOW(), INTERVAL 1 DAY), NULL, 'Person', 'PER00000003', 'Sarah Thompson', 'Person', 'PER00000068', 'Kevin Martin', 'Person', 'PER00000027', 'Michael Davis', 'Visit Hospitalized Member', 'Pending', NULL, NULL, CONCAT('{"description": "Visit Sarah Thompson at City General Hospital", "dueDate": "', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d'), '"}')),
    ('TSK00000007', 'CHU00000001', 7, 'Care', DATE_SUB(NOW(), INTERVAL 1 DAY), NULL, 'Person', 'PER00000004', 'James Wilson', 'Person', 'PER00000069', 'Rachel Martin', 'Person', 'PER00000027', 'Michael Davis', 'Follow-up Prayer Request', 'Pending', NULL, NULL, CONCAT('{"description": "Call back regarding prayer request from James Wilson", "dueDate": "', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 2 DAY), '%Y-%m-%d'), '"}')),

    -- Birthday Card Tasks
    ('TSK00000008', 'CHU00000001', 8, 'Automation', DATE_SUB(NOW(), INTERVAL 6 DAY), NULL, 'Person', 'PER00000028', 'Emily Davis', 'Automation', 'AUT00000001', 'Birthday Card Automation', 'Person', 'PER00000069', 'Rachel Martin', 'Send Birthday Card to Emily Davis', 'Pending', 'AUT00000001', NULL, CONCAT('{"description": "Send birthday card to Emily Davis for their upcoming birthday. Address: 123 Main St, Anytown, USA", "dueDate": "', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 12 DAY), '%Y-%m-%d'), '"}')),
    ('TSK00000009', 'CHU00000001', 9, 'Automation', DATE_SUB(NOW(), INTERVAL 6 DAY), NULL, 'Person', 'PER00000029', 'Michael Wilson', 'Automation', 'AUT00000001', 'Birthday Card Automation', 'Person', 'PER00000069', 'Rachel Martin', 'Send Birthday Card to Michael Wilson', 'Pending', 'AUT00000001', NULL, CONCAT('{"description": "Send birthday card to Michael Wilson for their upcoming birthday. Address: 456 Oak Ave, Anytown, USA", "dueDate": "', DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 17 DAY), '%Y-%m-%d'), '"}'));
END //
DELIMITER ;

-- Execute the stored procedure to populate demo data
CALL resetDemoData(); 