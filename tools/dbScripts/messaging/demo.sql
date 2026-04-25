DROP PROCEDURE IF EXISTS resetDemoData;

-- Create stored procedure to reset demo data
DELIMITER //
CREATE PROCEDURE resetDemoData()
BEGIN

    -- Truncate all tables in correct order (respecting foreign key constraints)
    SET FOREIGN_KEY_CHECKS = 0;
    TRUNCATE TABLE deviceContents;
    TRUNCATE TABLE connections;
    TRUNCATE TABLE blockedIps;
    TRUNCATE TABLE privateMessages;
    TRUNCATE TABLE sentTexts;
    TRUNCATE TABLE deliveryLogs;
    TRUNCATE TABLE notifications;
    TRUNCATE TABLE notificationPreferences;
    TRUNCATE TABLE messages;
    TRUNCATE TABLE conversations;
    TRUNCATE TABLE devices;
    TRUNCATE TABLE emailTemplates;
    TRUNCATE TABLE textingProviders;
    SET FOREIGN_KEY_CHECKS = 1;

    -- ========================================
    -- Conversations
    -- ========================================
    INSERT INTO conversations (id, churchId, contentType, contentId, title, dateCreated, groupId, visibility, firstPostId, lastPostId, postCount, allowAnonymousPosts) VALUES
    ('CVS00000001', 'CHU00000001', 'group', 'GRP00000014', 'Young Families Discussion', DATE_SUB(NOW(), INTERVAL 14 DAY), 'GRP00000014', 'public', 'MSG00000001', 'MSG00000004', 4, b'0'),
    ('CVS00000002', 'CHU00000001', 'group', 'GRP00000013', 'Youth Group Chat', DATE_SUB(NOW(), INTERVAL 10 DAY), 'GRP00000013', 'public', 'MSG00000005', 'MSG00000007', 3, b'0'),
    ('CVS00000003', 'CHU00000001', 'church', 'CHU00000001', 'General Announcements', DATE_SUB(NOW(), INTERVAL 30 DAY), NULL, 'public', 'MSG00000008', 'MSG00000010', 3, b'0'),
    ('CVS00000004', 'CHU00000001', 'group', 'GRP00000019', 'Praise Team Planning', DATE_SUB(NOW(), INTERVAL 7 DAY), 'GRP00000019', 'members', 'MSG00000011', 'MSG00000012', 2, b'0'),
    ('CVS00000005', 'CHU00000001', 'church', 'CHU00000001', 'Prayer Requests', DATE_SUB(NOW(), INTERVAL 21 DAY), NULL, 'public', 'MSG00000013', 'MSG00000015', 3, b'0'),
    ('CVS00000006', 'CHU00000001', 'group', 'GRP00000004', 'Adult Bible Class Discussion', DATE_SUB(NOW(), INTERVAL 5 DAY), 'GRP00000004', 'public', 'MSG00000016', 'MSG00000017', 2, b'0');

    -- ========================================
    -- Messages
    -- ========================================
    INSERT INTO messages (id, churchId, conversationId, displayName, timeSent, messageType, content, personId, timeUpdated) VALUES
    -- Young Families Discussion (CVS00000001)
    ('MSG00000001', 'CHU00000001', 'CVS00000001', 'Michael Davis', DATE_SUB(NOW(), INTERVAL 14 DAY), 'message', 'Hey families! Who''s interested in a group picnic at the park this Saturday?', 'PER00000027', DATE_SUB(NOW(), INTERVAL 14 DAY)),
    ('MSG00000002', 'CHU00000001', 'CVS00000001', 'Christopher Thomas', DATE_SUB(NOW(), INTERVAL 13 DAY), 'message', 'We''re in! The kids would love it. What time?', 'PER00000056', DATE_SUB(NOW(), INTERVAL 13 DAY)),
    ('MSG00000003', 'CHU00000001', 'CVS00000001', 'Demo User', DATE_SUB(NOW(), INTERVAL 13 DAY) + INTERVAL 2 HOUR, 'message', 'Count us in too! Should we bring anything?', 'PER00000082', DATE_SUB(NOW(), INTERVAL 13 DAY) + INTERVAL 2 HOUR),
    ('MSG00000004', 'CHU00000001', 'CVS00000001', 'Michael Davis', DATE_SUB(NOW(), INTERVAL 12 DAY), 'message', 'Let''s meet at 11 AM at Lincoln Park. Everyone bring a dish to share!', 'PER00000027', DATE_SUB(NOW(), INTERVAL 12 DAY)),

    -- Youth Group Chat (CVS00000002)
    ('MSG00000005', 'CHU00000001', 'CVS00000002', 'Matthew Jones', DATE_SUB(NOW(), INTERVAL 10 DAY), 'message', 'Who else is pumped for the retreat next month?', 'PER00000018', DATE_SUB(NOW(), INTERVAL 10 DAY)),
    ('MSG00000006', 'CHU00000001', 'CVS00000002', 'Andrew Wilson', DATE_SUB(NOW(), INTERVAL 9 DAY), 'message', 'Can''t wait! Are we doing the ropes course again?', 'PER00000051', DATE_SUB(NOW(), INTERVAL 9 DAY)),
    ('MSG00000007', 'CHU00000001', 'CVS00000002', 'Sophia Jones', DATE_SUB(NOW(), INTERVAL 9 DAY) + INTERVAL 3 HOUR, 'message', 'I signed up already! It''s going to be amazing.', 'PER00000019', DATE_SUB(NOW(), INTERVAL 9 DAY) + INTERVAL 3 HOUR),

    -- General Announcements (CVS00000003)
    ('MSG00000008', 'CHU00000001', 'CVS00000003', 'John Smith', DATE_SUB(NOW(), INTERVAL 21 DAY), 'message', 'Reminder: Church workday this Saturday starting at 8 AM. Bring gloves and tools!', 'PER00000001', DATE_SUB(NOW(), INTERVAL 21 DAY)),
    ('MSG00000009', 'CHU00000001', 'CVS00000003', 'John Smith', DATE_SUB(NOW(), INTERVAL 7 DAY), 'message', 'The new fellowship hall renovations are complete. Come see the space after service this Sunday!', 'PER00000001', DATE_SUB(NOW(), INTERVAL 7 DAY)),
    ('MSG00000010', 'CHU00000001', 'CVS00000003', 'Demo User', DATE_SUB(NOW(), INTERVAL 3 DAY), 'message', 'Don''t forget to sign up for the missions conference. Registration closes this Friday.', 'PER00000082', DATE_SUB(NOW(), INTERVAL 3 DAY)),

    -- Praise Team Planning (CVS00000004)
    ('MSG00000011', 'CHU00000001', 'CVS00000004', 'Michael Davis', DATE_SUB(NOW(), INTERVAL 5 DAY), 'message', 'Song list for next Sunday: What a Beautiful Name, Good Good Father, Amazing Grace. Practice Thursday at 7 PM.', 'PER00000027', DATE_SUB(NOW(), INTERVAL 5 DAY)),
    ('MSG00000012', 'CHU00000001', 'CVS00000004', 'David Lopez', DATE_SUB(NOW(), INTERVAL 4 DAY), 'message', 'Got it. I''ll prepare the chord charts for all three.', 'PER00000042', DATE_SUB(NOW(), INTERVAL 4 DAY)),

    -- Prayer Requests (CVS00000005)
    ('MSG00000013', 'CHU00000001', 'CVS00000005', 'Miguel Hernandez', DATE_SUB(NOW(), INTERVAL 18 DAY), 'message', 'Please pray for my father Antonio''s recovery from hip surgery.', 'PER00000036', DATE_SUB(NOW(), INTERVAL 18 DAY)),
    ('MSG00000014', 'CHU00000001', 'CVS00000005', 'Michelle Lee', DATE_SUB(NOW(), INTERVAL 10 DAY), 'message', 'Prayers requested for my children as they transition to new school.', 'PER00000070', DATE_SUB(NOW(), INTERVAL 10 DAY)),
    ('MSG00000015', 'CHU00000001', 'CVS00000005', 'George Thompson', DATE_SUB(NOW(), INTERVAL 2 DAY), 'message', 'Praise report: Margaret''s test results came back clear! Thank you for your prayers.', 'PER00000073', DATE_SUB(NOW(), INTERVAL 2 DAY)),

    -- Adult Bible Class Discussion (CVS00000006) — group conversation visible
    -- to demo user, who is a member of GRP00000004.
    ('MSG00000016', 'CHU00000001', 'CVS00000006', 'John Smith', DATE_SUB(NOW(), INTERVAL 5 DAY), 'message', 'This week we''re studying Romans chapter 8 — bring your Bible and a friend!', 'PER00000001', DATE_SUB(NOW(), INTERVAL 5 DAY)),
    ('MSG00000017', 'CHU00000001', 'CVS00000006', 'Demo User', DATE_SUB(NOW(), INTERVAL 4 DAY), 'message', 'Looking forward to it. I''ll bring coffee.', 'PER00000082', DATE_SUB(NOW(), INTERVAL 4 DAY));

    -- ========================================
    -- Notifications
    -- ========================================
    INSERT INTO notifications (id, churchId, personId, contentType, contentId, timeSent, isNew, message, link, deliveryMethod, triggeredByPersonId) VALUES
    ('NTF00000001', 'CHU00000001', 'PER00000082', 'conversation', 'CVS00000001', DATE_SUB(NOW(), INTERVAL 12 DAY), b'1', 'Michael Davis posted in Young Families Discussion', '/groups/GRP00000014', 'push', 'PER00000027'),
    ('NTF00000002', 'CHU00000001', 'PER00000082', 'conversation', 'CVS00000003', DATE_SUB(NOW(), INTERVAL 7 DAY), b'1', 'New announcement from John Smith', '/announcements', 'email', 'PER00000001'),
    ('NTF00000003', 'CHU00000001', 'PER00000027', 'conversation', 'CVS00000004', DATE_SUB(NOW(), INTERVAL 4 DAY), b'0', 'David Lopez replied in Praise Team Planning', '/groups/GRP00000019', 'push', 'PER00000042'),
    ('NTF00000004', 'CHU00000001', 'PER00000001', 'task', 'TSK00000001', DATE_SUB(NOW(), INTERVAL 2 DAY), b'1', 'New task assigned: Invite New Visitor to Lunch', '/tasks', 'push', 'PER00000027'),
    ('NTF00000005', 'CHU00000001', 'PER00000036', 'conversation', 'CVS00000005', DATE_SUB(NOW(), INTERVAL 10 DAY), b'0', 'Michelle Lee added a prayer request', '/prayer', 'push', 'PER00000070'),
    ('NTF00000006', 'CHU00000001', 'PER00000082', 'assignment', 'ASS00000008', DATE_SUB(NOW(), INTERVAL 1 DAY), b'1', 'You have been assigned Sound Tech for upcoming service', '/serving', 'email', 'PER00000027'),
    ('NTF00000007', 'CHU00000001', 'PER00000056', 'conversation', 'CVS00000001', DATE_SUB(NOW(), INTERVAL 13 DAY), b'0', 'Demo User replied in Young Families Discussion', '/groups/GRP00000014', 'push', 'PER00000082'),
    ('NTF00000008', 'CHU00000001', 'PER00000070', 'conversation', 'CVS00000005', DATE_SUB(NOW(), INTERVAL 2 DAY), b'1', 'George Thompson shared a praise report', '/prayer', 'push', 'PER00000073');

    -- ========================================
    -- Notification Preferences
    -- ========================================
    INSERT INTO notificationPreferences (id, churchId, personId, allowPush, emailFrequency) VALUES
    ('NPR00000001', 'CHU00000001', 'PER00000082', b'1', 'realtime'),
    ('NPR00000002', 'CHU00000001', 'PER00000001', b'1', 'daily'),
    ('NPR00000003', 'CHU00000001', 'PER00000027', b'1', 'realtime'),
    ('NPR00000004', 'CHU00000001', 'PER00000036', b'1', 'weekly'),
    ('NPR00000005', 'CHU00000001', 'PER00000073', b'0', 'daily'),
    ('NPR00000006', 'CHU00000001', 'PER00000060', b'1', 'none');

    -- ========================================
    -- Devices
    -- ========================================
    INSERT INTO devices (id, appName, deviceId, churchId, personId, fcmToken, label, registrationDate, lastActiveDate, deviceInfo, ipAddress) VALUES
    ('DEV00000001', 'B1Mobile', 'dev_demo_001', 'CHU00000001', 'PER00000082', 'fcm_token_demo_001', 'Demo iPhone', '2025-09-15 10:00:00', DATE_SUB(NOW(), INTERVAL 1 HOUR), '{"platform": "ios", "model": "iPhone 15", "osVersion": "18.2"}', '192.168.1.100'),
    ('DEV00000002', 'B1Mobile', 'dev_demo_002', 'CHU00000001', 'PER00000001', 'fcm_token_demo_002', 'John''s Android', '2025-10-01 10:00:00', DATE_SUB(NOW(), INTERVAL 3 HOUR), '{"platform": "android", "model": "Pixel 8", "osVersion": "15"}', '192.168.1.101'),
    ('DEV00000003', 'B1Mobile', 'dev_demo_003', 'CHU00000001', 'PER00000027', 'fcm_token_demo_003', 'Michael''s iPad', '2025-10-15 10:00:00', DATE_SUB(NOW(), INTERVAL 12 HOUR), '{"platform": "ios", "model": "iPad Pro", "osVersion": "18.2"}', '192.168.1.102'),
    ('DEV00000004', 'B1Checkin', 'dev_checkin_001', 'CHU00000001', NULL, 'fcm_token_checkin_001', 'Lobby Kiosk', '2025-08-01 10:00:00', DATE_SUB(NOW(), INTERVAL 2 DAY), '{"platform": "android", "model": "Samsung Tab", "osVersion": "14"}', '192.168.1.200'),
    ('DEV00000005', 'FreePlay', 'dev_freeplay_001', 'CHU00000001', NULL, NULL, 'Sanctuary TV', '2025-08-15 10:00:00', DATE_SUB(NOW(), INTERVAL 1 DAY), '{"platform": "androidtv", "model": "Shield TV", "osVersion": "13"}', '192.168.1.201');

    -- ========================================
    -- Delivery Logs
    -- ========================================
    INSERT INTO deliveryLogs (id, churchId, personId, contentType, contentId, deliveryMethod, success, errorMessage, deliveryAddress, attemptTime) VALUES
    ('DLG00000001', 'CHU00000001', 'PER00000082', 'notification', 'NTF00000001', 'push', b'1', NULL, 'fcm_token_demo_001', DATE_SUB(NOW(), INTERVAL 12 DAY)),
    ('DLG00000002', 'CHU00000001', 'PER00000082', 'notification', 'NTF00000002', 'email', b'1', NULL, 'demo@b1.church', DATE_SUB(NOW(), INTERVAL 7 DAY)),
    ('DLG00000003', 'CHU00000001', 'PER00000001', 'notification', 'NTF00000004', 'push', b'1', NULL, 'fcm_token_demo_002', DATE_SUB(NOW(), INTERVAL 2 DAY)),
    ('DLG00000004', 'CHU00000001', 'PER00000036', 'notification', 'NTF00000005', 'push', b'1', NULL, NULL, DATE_SUB(NOW(), INTERVAL 10 DAY)),
    ('DLG00000005', 'CHU00000001', 'PER00000073', 'notification', 'NTF00000008', 'email', b'0', 'Mailbox full', 'george.thompson@email.com', DATE_SUB(NOW(), INTERVAL 2 DAY));

    -- ========================================
    -- Email Templates
    -- ========================================
    INSERT INTO emailTemplates (id, churchId, name, subject, htmlContent, category, dateCreated, dateModified) VALUES
    ('ETP00000001', 'CHU00000001', 'Welcome Email', 'Welcome to Grace Community Church!',
      '<h1>Welcome!</h1><p>Dear {{name}},</p><p>We are so glad you visited Grace Community Church. We hope you felt at home and we look forward to seeing you again soon!</p><p>Blessings,<br/>Grace Community Church</p>',
      'visitor', DATE_SUB(NOW(), INTERVAL 90 DAY), DATE_SUB(NOW(), INTERVAL 30 DAY)),
    ('ETP00000002', 'CHU00000001', 'Weekly Newsletter', '{{churchName}} Weekly Update',
      '<h1>This Week at Grace</h1><p>{{content}}</p><p>See you Sunday!</p>',
      'newsletter', DATE_SUB(NOW(), INTERVAL 60 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY)),
    ('ETP00000003', 'CHU00000001', 'Event Reminder', 'Reminder: {{eventName}} is coming up!',
      '<h1>Don''t Forget!</h1><p>{{eventName}} is happening on {{eventDate}}.</p><p>{{eventDescription}}</p><p>We hope to see you there!</p>',
      'event', DATE_SUB(NOW(), INTERVAL 45 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY)),
    ('ETP00000004', 'CHU00000001', 'Birthday Greeting', 'Happy Birthday from Grace Community Church!',
      '<h1>Happy Birthday, {{name}}!</h1><p>Wishing you a wonderful birthday filled with God''s blessings. We are thankful for you and your part in our church family.</p><p>With love,<br/>Grace Community Church</p>',
      'birthday', DATE_SUB(NOW(), INTERVAL 90 DAY), DATE_SUB(NOW(), INTERVAL 60 DAY));

    -- ========================================
    -- Texting Providers
    -- ========================================
    INSERT INTO textingProviders (id, churchId, provider, apiKey, apiSecret, fromNumber, enabled) VALUES
    ('TXP00000001', 'CHU00000001', 'clearstream', 'demo_api_key_clearstream', NULL, '+12175550000', b'1');

    -- ========================================
    -- Sent Texts
    -- ========================================
    INSERT INTO sentTexts (id, churchId, groupId, recipientPersonId, senderPersonId, message, recipientCount, successCount, failCount, timeSent) VALUES
    ('STX00000001', 'CHU00000001', 'GRP00000001', NULL, 'PER00000001', 'Reminder: Service times are changing next Sunday. Morning service starts at 10:30 AM.', 45, 43, 2, DATE_SUB(NOW(), INTERVAL 14 DAY)),
    ('STX00000002', 'CHU00000001', 'GRP00000013', NULL, 'PER00000027', 'Youth group is cancelled this Wednesday due to weather. Stay safe!', 12, 12, 0, DATE_SUB(NOW(), INTERVAL 7 DAY)),
    ('STX00000003', 'CHU00000001', NULL, 'PER00000082', 'PER00000001', 'Hey Demo, can you cover sound tech this Sunday? Michael is out.', 1, 1, 0, DATE_SUB(NOW(), INTERVAL 3 DAY));

    -- ========================================
    -- Private Messages
    -- ========================================
    INSERT INTO privateMessages (id, churchId, fromPersonId, toPersonId, conversationId, notifyPersonId, deliveryMethod) VALUES
    ('PRM00000001', 'CHU00000001', 'PER00000001', 'PER00000082', 'CVS00000003', 'PER00000082', 'push'),
    ('PRM00000002', 'CHU00000001', 'PER00000027', 'PER00000082', 'CVS00000004', 'PER00000082', 'email'),
    ('PRM00000003', 'CHU00000001', 'PER00000082', 'PER00000001', 'CVS00000003', 'PER00000001', 'push');

    -- ========================================
    -- Device Contents
    -- ========================================
    INSERT INTO deviceContents (id, churchId, deviceId, contentType, contentId) VALUES
    ('DCT00000001', 'CHU00000001', 'DEV00000005', 'playlist', 'PLY00000001'),
    ('DCT00000002', 'CHU00000001', 'DEV00000005', 'streamingService', 'STR00000001');

END //
DELIMITER ;

-- Execute the stored procedure to populate demo data
CALL resetDemoData();
