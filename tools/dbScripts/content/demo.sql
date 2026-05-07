DROP PROCEDURE IF EXISTS resetDemoData;

-- Create stored procedure to reset demo data
DELIMITER //
CREATE PROCEDURE resetDemoData()
BEGIN
    -- Truncate all tables (in order to respect foreign key constraints)
    SET FOREIGN_KEY_CHECKS = 0;
    TRUNCATE TABLE registrationMembers;
    TRUNCATE TABLE registrations;
    TRUNCATE TABLE links;
    TRUNCATE TABLE globalStyles;
    TRUNCATE TABLE files;
    TRUNCATE TABLE streamingServices;
    TRUNCATE TABLE sermons;
    TRUNCATE TABLE playlists;
    TRUNCATE TABLE elements;
    TRUNCATE TABLE sections;
    TRUNCATE TABLE pages;
    TRUNCATE TABLE blocks;
    TRUNCATE TABLE curatedEvents;
    TRUNCATE TABLE curatedCalendars;
    TRUNCATE TABLE eventExceptions;
    TRUNCATE TABLE events;
    TRUNCATE TABLE arrangementKeys;
    TRUNCATE TABLE arrangements;
    TRUNCATE TABLE songDetailLinks;
    TRUNCATE TABLE songDetails;
    TRUNCATE TABLE songs;
    TRUNCATE TABLE settings;
    SET FOREIGN_KEY_CHECKS = 1;

    -- Songs
    INSERT INTO songs (id, churchId, name, dateAdded) VALUES
    -- Modern Worship Songs
    ('SON00000001', 'CHU00000001', 'What a Beautiful Name', '2024-01-01'),
    ('SON00000002', 'CHU00000001', 'Good Good Father', '2024-01-01'),
    ('SON00000003', 'CHU00000001', 'Reckless Love', '2024-01-01'),
    ('SON00000004', 'CHU00000001', 'Build My Life', '2024-01-01'),
    ('SON00000005', 'CHU00000001', 'Graves Into Gardens', '2024-01-01'),

    -- Classic Hymns
    ('SON00000006', 'CHU00000001', 'Amazing Grace', '2024-01-01'),
    ('SON00000007', 'CHU00000001', 'How Great Thou Art', '2024-01-01'),
    ('SON00000008', 'CHU00000001', 'Great Is Thy Faithfulness', '2024-01-01'),
    ('SON00000009', 'CHU00000001', 'Be Thou My Vision', '2024-01-01'),
    ('SON00000010', 'CHU00000001', 'It Is Well With My Soul', '2024-01-01');

    -- Song Details
    INSERT INTO songDetails (id, praiseChartsId, musicBrainzId, title, artist, album, language, thumbnail, releaseDate, bpm, keySignature, seconds, meter, tones) VALUES
    -- Modern Worship Songs
    ('SDT00000001', 'PC123456', 'MB789012', 'What a Beautiful Name', 'Hillsong Worship', 'Let There Be Light', 'en', '/images/songs/what-a-beautiful-name.jpg', '2016-01-01', 75, 'B', 360, '4/4', 'B'),
    ('SDT00000002', 'PC234567', 'MB890123', 'Good Good Father', 'Chris Tomlin', 'Good Good Father', 'en', '/images/songs/good-good-father.jpg', '2014-01-01', 72, 'G', 345, '4/4', 'G'),
    ('SDT00000003', 'PC345678', 'MB901234', 'Reckless Love', 'Cory Asbury', 'Reckless Love', 'en', '/images/songs/reckless-love.jpg', '2017-01-01', 70, 'A', 350, '4/4', 'A'),
    ('SDT00000004', 'PC456789', 'MB012345', 'Build My Life', 'Pat Barrett', 'Build My Life', 'en', '/images/songs/build-my-life.jpg', '2016-01-01', 68, 'E', 355, '4/4', 'E'),
    ('SDT00000005', 'PC567890', 'MB123456', 'Graves Into Gardens', 'Elevation Worship', 'Graves Into Gardens', 'en', '/images/songs/graves-into-gardens.jpg', '2020-01-01', 74, 'F#', 365, '4/4', 'F#'),

    -- Classic Hymns
    ('SDT00000006', NULL, NULL, 'Amazing Grace', 'John Newton', 'Classic Hymns', 'en', '/images/songs/amazing-grace.jpg', '1779-01-01', 60, 'G', 300, '3/4', 'G'),
    ('SDT00000007', NULL, NULL, 'How Great Thou Art', 'Carl Boberg', 'Classic Hymns', 'en', '/images/songs/how-great-thou-art.jpg', '1885-01-01', 65, 'C', 310, '4/4', 'C'),
    ('SDT00000008', NULL, NULL, 'Great Is Thy Faithfulness', 'Thomas Chisholm', 'Classic Hymns', 'en', '/images/songs/great-is-thy-faithfulness.jpg', '1923-01-01', 63, 'F', 315, '4/4', 'F'),
    ('SDT00000009', NULL, NULL, 'Be Thou My Vision', 'Dallan Forgaill', 'Classic Hymns', 'en', '/images/songs/be-thou-my-vision.jpg', '1905-01-01', 58, 'D', 305, '4/4', 'D'),
    ('SDT00000010', NULL, NULL, 'It Is Well With My Soul', 'Horatio Spafford', 'Classic Hymns', 'en', '/images/songs/it-is-well.jpg', '1873-01-01', 62, 'Eb', 320, '4/4', 'Eb');

    -- Song Detail Links
    INSERT INTO songDetailLinks (id, songDetailId, service, serviceKey, url) VALUES
    -- Modern Worship Songs
    ('SDL00000001', 'SDT00000001', 'YouTube', 'nQWFzMvCfLE', 'https://www.youtube.com/watch?v=nQWFzMvCfLE'),
    ('SDL00000002', 'SDT00000001', 'Spotify', '4KuKzIsfbtp6woLL3ZxRhz', 'https://open.spotify.com/track/4KuKzIsfbtp6woLL3ZxRhz'),
    ('SDL00000003', 'SDT00000002', 'YouTube', 'CqybaIesbuA', 'https://www.youtube.com/watch?v=CqybaIesbuA'),
    ('SDL00000004', 'SDT00000002', 'Spotify', '1nKS4IsazxwvBEn3MLxD5A', 'https://open.spotify.com/track/1nKS4IsazxwvBEn3MLxD5A'),
    ('SDL00000005', 'SDT00000003', 'YouTube', 'Sc6SSHuZvQE', 'https://www.youtube.com/watch?v=Sc6SSHuZvQE'),
    ('SDL00000006', 'SDT00000003', 'Spotify', '0k1WhFtVp0rsC1RXGwlFdKnGLwK3G1z', 'https://open.spotify.com/track/0k1WhFtVp0rsC1RXGwlFdKnGLwK3G1z'),
    ('SDL00000007', 'SDT00000004', 'YouTube', 'r49TxokzD9s', 'https://www.youtube.com/watch?v=r49TxokzD9s'),
    ('SDL00000008', 'SDT00000004', 'Spotify', '2IBG8XcWyDR1emlDo0Dm9I', 'https://open.spotify.com/track/2IBG8XcWyDR1emlDo0Dm9I'),
    ('SDL00000009', 'SDT00000005', 'YouTube', 'OuYk3P2erKA', 'https://www.youtube.com/watch?v=OuYk3P2erKA'),
    ('SDL00000010', 'SDT00000005', 'Spotify', '5vLcVysT4bJc4xHMp6hj9t', 'https://open.spotify.com/track/5vLcVysT4bJc4xHMp6hj9t'),

    -- Classic Hymns
    ('SDL00000011', 'SDT00000006', 'YouTube', 'HsCp5LG_zNE', 'https://www.youtube.com/watch?v=HsCp5LG_zNE'),
    ('SDL00000012', 'SDT00000007', 'YouTube', '1yB5F_3yxyU', 'https://www.youtube.com/watch?v=1yB5F_3yxyU'),
    ('SDL00000013', 'SDT00000008', 'YouTube', '0k1WhFtVp0o', 'https://www.youtube.com/watch?v=0k1WhFtVp0o'),
    ('SDL00000014', 'SDT00000009', 'YouTube', 'jIMhXpFD7Uc', 'https://www.youtube.com/watch?v=jIMhXpFD7Uc'),
    ('SDL00000015', 'SDT00000010', 'YouTube', 'LYY5AYv0M0o', 'https://www.youtube.com/watch?v=LYY5AYv0M0o');

    -- Arrangements
    INSERT INTO arrangements (id, churchId, songId, songDetailId, name, lyrics, freeShowId) VALUES
    -- Modern Worship Songs
    ('ARR00000001', 'CHU00000001', 'SON00000001', 'SDT00000001', 'Standard', 'Verse 1:\nYou were the Word at the beginning...', NULL),
    ('ARR00000002', 'CHU00000001', 'SON00000002', 'SDT00000002', 'Standard', 'Verse 1:\nI''ve heard a thousand stories...', NULL),
    ('ARR00000003', 'CHU00000001', 'SON00000003', 'SDT00000003', 'Standard', 'Verse 1:\nBefore I spoke a word...', NULL),
    ('ARR00000004', 'CHU00000001', 'SON00000004', 'SDT00000004', 'Standard', 'Verse 1:\nWorthy of every song...', NULL),
    ('ARR00000005', 'CHU00000001', 'SON00000005', 'SDT00000005', 'Standard', 'Verse 1:\nI searched the world...', NULL),

    -- Classic Hymns
    ('ARR00000006', 'CHU00000001', 'SON00000006', 'SDT00000006', 'Traditional', 'Verse 1:\nAmazing grace! How sweet the sound...', NULL),
    ('ARR00000007', 'CHU00000001', 'SON00000006', 'SDT00000006', 'Modern', 'Verse 1:\nAmazing grace! How sweet the sound...', NULL),
    ('ARR00000008', 'CHU00000001', 'SON00000007', 'SDT00000007', 'Traditional', 'Verse 1:\nO Lord my God, when I in awesome wonder...', NULL),
    ('ARR00000009', 'CHU00000001', 'SON00000007', 'SDT00000007', 'Modern', 'Verse 1:\nO Lord my God, when I in awesome wonder...', NULL),
    ('ARR00000010', 'CHU00000001', 'SON00000008', 'SDT00000008', 'Traditional', 'Verse 1:\nGreat is Thy faithfulness...', NULL),
    ('ARR00000011', 'CHU00000001', 'SON00000008', 'SDT00000008', 'Modern', 'Verse 1:\nGreat is Thy faithfulness...', NULL),
    ('ARR00000012', 'CHU00000001', 'SON00000009', 'SDT00000009', 'Traditional', 'Verse 1:\nBe Thou my Vision, O Lord of my heart...', NULL),
    ('ARR00000013', 'CHU00000001', 'SON00000009', 'SDT00000009', 'Modern', 'Verse 1:\nBe Thou my Vision, O Lord of my heart...', NULL),
    ('ARR00000014', 'CHU00000001', 'SON00000010', 'SDT00000010', 'Traditional', 'Verse 1:\nWhen peace like a river...', NULL),
    ('ARR00000015', 'CHU00000001', 'SON00000010', 'SDT00000010', 'Modern', 'Verse 1:\nWhen peace like a river...', NULL);

    -- Arrangement Keys
    INSERT INTO arrangementKeys (id, churchId, arrangementId, keySignature, shortDescription) VALUES
    -- Modern Worship Songs
    ('ARK00000001', 'CHU00000001', 'ARR00000001', 'B', 'Original key'),
    ('ARK00000002', 'CHU00000001', 'ARR00000001', 'A', 'Lower key'),
    ('ARK00000003', 'CHU00000001', 'ARR00000002', 'G', 'Original key'),
    ('ARK00000004', 'CHU00000001', 'ARR00000002', 'F', 'Lower key'),
    ('ARK00000005', 'CHU00000001', 'ARR00000003', 'A', 'Original key'),
    ('ARK00000006', 'CHU00000001', 'ARR00000003', 'G', 'Lower key'),
    ('ARK00000007', 'CHU00000001', 'ARR00000004', 'E', 'Original key'),
    ('ARK00000008', 'CHU00000001', 'ARR00000004', 'D', 'Lower key'),
    ('ARK00000009', 'CHU00000001', 'ARR00000005', 'F#', 'Original key'),
    ('ARK00000010', 'CHU00000001', 'ARR00000005', 'E', 'Lower key'),

    -- Classic Hymns
    ('ARK00000011', 'CHU00000001', 'ARR00000006', 'G', 'Traditional key'),
    ('ARK00000012', 'CHU00000001', 'ARR00000007', 'D', 'Modern key'),
    ('ARK00000013', 'CHU00000001', 'ARR00000008', 'C', 'Traditional key'),
    ('ARK00000014', 'CHU00000001', 'ARR00000009', 'G', 'Modern key'),
    ('ARK00000015', 'CHU00000001', 'ARR00000010', 'F', 'Traditional key'),
    ('ARK00000016', 'CHU00000001', 'ARR00000011', 'C', 'Modern key'),
    ('ARK00000017', 'CHU00000001', 'ARR00000012', 'D', 'Traditional key'),
    ('ARK00000018', 'CHU00000001', 'ARR00000013', 'G', 'Modern key'),
    ('ARK00000019', 'CHU00000001', 'ARR00000014', 'Eb', 'Traditional key'),
    ('ARK00000020', 'CHU00000001', 'ARR00000015', 'C', 'Modern key');

    -- Events
    -- Note: Using dynamic dates relative to current date for all events
    INSERT INTO events (id, churchId, groupId, title, description, start, end, allDay, recurrenceRule, visibility) VALUES
    -- Sunday Services (Recurring Weekly) - Start from next Sunday
    ('EVT00000001', 'CHU00000001', 'GRP00000001', 'Sunday Morning Service', 'Main worship service with contemporary music and biblical teaching', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '10:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '11:30:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=SU', 'public'),
    ('EVT00000002', 'CHU00000001', 'GRP00000002', 'Sunday Evening Service', 'Evening service with traditional hymns and deeper Bible study', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '18:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '19:30:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=SU', 'public'),

    -- Sunday School Classes (Recurring Weekly) - Start from next Sunday
    ('EVT00000003', 'CHU00000001', 'GRP00000004', 'Adult Bible Class', 'In-depth Bible study for adults', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '09:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '09:45:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=SU', 'public'),
    ('EVT00000004', 'CHU00000001', 'GRP00000005', 'Young Adults Class', 'Bible study for young adults', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '09:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '09:45:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=SU', 'public'),

    -- Youth Group Events (Recurring Weekly) - Start from next Wednesday
    ('EVT00000005', 'CHU00000001', 'GRP00000013', 'Youth Group Meeting', 'Weekly youth group with games, worship, and Bible study', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (2 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '18:30:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (2 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '20:30:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=WE', 'public'),
    ('EVT00000006', 'CHU00000001', 'GRP00000011', 'Middle School Bible Study', 'Bible study for middle school students', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '09:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '09:45:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=SU', 'public'),
    ('EVT00000007', 'CHU00000001', 'GRP00000012', 'High School Bible Study', 'Bible study for high school students', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '09:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '09:45:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=SU', 'public'),

    -- Small Groups (Recurring Weekly) - Start from next occurrence of each day
    ('EVT00000008', 'CHU00000001', 'GRP00000014', 'Young Families Group', 'Small group for families with young children', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (1 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '19:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (1 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '20:30:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=TU', 'public'),
    ('EVT00000009', 'CHU00000001', 'GRP00000015', 'Empty Nesters Group', 'Small group for couples whose children have left home', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (3 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '19:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (3 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '20:30:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=TH', 'public'),
    ('EVT00000010', 'CHU00000001', 'GRP00000016', 'Men''s Bible Study', 'Weekly Bible study for men', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (5 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '07:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (5 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '08:30:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=SA', 'public'),
    ('EVT00000011', 'CHU00000001', 'GRP00000017', 'Women''s Bible Study', 'Weekly Bible study for women', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (1 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '10:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (1 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '11:30:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=TU', 'public'),

    -- Music Ministry (Recurring Weekly)
    ('EVT00000012', 'CHU00000001', 'GRP00000018', 'Adult Choir Practice', 'Weekly choir practice', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (3 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '19:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (3 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '20:30:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=TH', 'public'),
    ('EVT00000013', 'CHU00000001', 'GRP00000019', 'Praise Team Practice', 'Weekly praise team practice', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (5 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '10:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (5 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '12:00:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=SA', 'public'),
    ('EVT00000014', 'CHU00000001', 'GRP00000020', 'Children''s Choir Practice', 'Weekly children''s choir practice', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (2 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '16:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (2 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '17:00:00' HOUR_SECOND), 
        0, 'FREQ=WEEKLY;BYDAY=WE', 'public'),

    -- Special Events (One-time) - Set to future dates
    ('EVT00000015', 'CHU00000001', 'GRP00000030', 'Vacation Bible School', 'Annual summer program for children', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 4 MONTH), INTERVAL '09:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 4 MONTH), INTERVAL '12:00:00' HOUR_SECOND) + INTERVAL 4 DAY, 
        0, NULL, 'public'),
    ('EVT00000016', 'CHU00000001', 'GRP00000022', 'Missions Conference', 'Annual missions conference', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), INTERVAL '18:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), INTERVAL '12:00:00' HOUR_SECOND) + INTERVAL 2 DAY, 
        0, NULL, 'public'),
    ('EVT00000017', 'CHU00000001', 'GRP00000021', 'Food Pantry Distribution', 'Monthly food pantry distribution', 
        DATE_ADD(DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY), INTERVAL '09:00:00' HOUR_SECOND) + INTERVAL ((5 + 7 - DAYOFWEEK(DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY))) % 7 + 14) DAY,
        DATE_ADD(DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY), INTERVAL '12:00:00' HOUR_SECOND) + INTERVAL ((5 + 7 - DAYOFWEEK(DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY))) % 7 + 14) DAY, 
        0, 'FREQ=MONTHLY;BYDAY=3SA', 'public');

    -- Enable registration on the seeded special events so /mobile/register/<id>
    -- and the public guest registration form have something live to render.
    -- VBS opens registration immediately; Missions Conference opens 7 days from
    -- now. Both close 1 day before the event start.
    UPDATE events
        SET registrationEnabled = b'1',
            capacity = 50,
            registrationOpenDate = DATE_SUB(NOW(), INTERVAL 7 DAY),
            registrationCloseDate = DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 4 MONTH), INTERVAL 1 DAY)
        WHERE id = 'EVT00000015';
    UPDATE events
        SET registrationEnabled = b'1',
            capacity = 100,
            registrationOpenDate = DATE_ADD(CURDATE(), INTERVAL 7 DAY),
            registrationCloseDate = DATE_SUB(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), INTERVAL 1 DAY)
        WHERE id = 'EVT00000016';

    -- Event Exceptions
    -- Note: Using dynamic dates relative to current date
    INSERT INTO eventExceptions (id, churchId, eventId, exceptionDate, recurrenceDate) VALUES
    -- Service Cancellations - Set for 2 weeks from now
    ('EXC00000001', 'CHU00000001', 'EVT00000001', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '10:00:00' HOUR_SECOND) + INTERVAL 14 DAY,
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '10:00:00' HOUR_SECOND) + INTERVAL 14 DAY),
    ('EXC00000002', 'CHU00000001', 'EVT00000002', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '18:00:00' HOUR_SECOND) + INTERVAL 14 DAY,
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '18:00:00' HOUR_SECOND) + INTERVAL 14 DAY),

    -- Location Changes - Set for 3 weeks from now
    ('EXC00000003', 'CHU00000001', 'EVT00000008', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (1 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '19:00:00' HOUR_SECOND) + INTERVAL 21 DAY,
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (1 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '19:00:00' HOUR_SECOND) + INTERVAL 21 DAY),
    ('EXC00000004', 'CHU00000001', 'EVT00000009', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (3 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '19:00:00' HOUR_SECOND) + INTERVAL 21 DAY,
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (3 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '19:00:00' HOUR_SECOND) + INTERVAL 21 DAY),

    -- Time Changes - Set for 1 month from now
    ('EXC00000005', 'CHU00000001', 'EVT00000010', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (5 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '08:00:00' HOUR_SECOND) + INTERVAL 28 DAY,
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (5 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '07:00:00' HOUR_SECOND) + INTERVAL 28 DAY),
    ('EXC00000006', 'CHU00000001', 'EVT00000011', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (1 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '09:30:00' HOUR_SECOND) + INTERVAL 28 DAY,
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (1 - WEEKDAY(CURDATE()) + 7) % 7 DAY), INTERVAL '10:00:00' HOUR_SECOND) + INTERVAL 28 DAY),

    -- Special Event Modifications - Adjust time for VBS and Missions Conference
    ('EXC00000007', 'CHU00000001', 'EVT00000015', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 4 MONTH), INTERVAL '08:30:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 4 MONTH), INTERVAL '09:00:00' HOUR_SECOND)),
    ('EXC00000008', 'CHU00000001', 'EVT00000016', 
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), INTERVAL '19:00:00' HOUR_SECOND),
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), INTERVAL '18:00:00' HOUR_SECOND));

    -- Curated Calendars
    INSERT INTO curatedCalendars (id, churchId, name) VALUES
    ('CAL00000001', 'CHU00000001', 'Youth Ministry Calendar'),
    ('CAL00000002', 'CHU00000001', 'Worship Ministry Calendar'),
    ('CAL00000003', 'CHU00000001', 'Small Groups Calendar'),
    ('CAL00000004', 'CHU00000001', 'Main Church Calendar');

    -- Curated Events
    INSERT INTO curatedEvents (id, churchId, curatedCalendarId, groupId, eventId) VALUES
    -- Youth Ministry Calendar
    ('CUR00000001', 'CHU00000001', 'CAL00000001', 'GRP00000013', 'EVT00000005'),
    ('CUR00000002', 'CHU00000001', 'CAL00000001', 'GRP00000011', 'EVT00000006'),
    ('CUR00000003', 'CHU00000001', 'CAL00000001', 'GRP00000012', 'EVT00000007'),
    ('CUR00000004', 'CHU00000001', 'CAL00000001', 'GRP00000030', 'EVT00000015'),

    -- Worship Ministry Calendar
    ('CUR00000005', 'CHU00000001', 'CAL00000002', 'GRP00000001', 'EVT00000001'),
    ('CUR00000006', 'CHU00000001', 'CAL00000002', 'GRP00000002', 'EVT00000002'),
    ('CUR00000007', 'CHU00000001', 'CAL00000002', 'GRP00000018', 'EVT00000012'),
    ('CUR00000008', 'CHU00000001', 'CAL00000002', 'GRP00000019', 'EVT00000013'),
    ('CUR00000009', 'CHU00000001', 'CAL00000002', 'GRP00000020', 'EVT00000014'),

    -- Small Groups Calendar
    ('CUR00000010', 'CHU00000001', 'CAL00000003', 'GRP00000014', 'EVT00000008'),
    ('CUR00000011', 'CHU00000001', 'CAL00000003', 'GRP00000015', 'EVT00000009'),
    ('CUR00000012', 'CHU00000001', 'CAL00000003', 'GRP00000016', 'EVT00000010'),
    ('CUR00000013', 'CHU00000001', 'CAL00000003', 'GRP00000017', 'EVT00000011'),

    -- Main Church Calendar
    ('CUR00000014', 'CHU00000001', 'CAL00000004', 'GRP00000001', 'EVT00000001'),
    ('CUR00000015', 'CHU00000001', 'CAL00000004', 'GRP00000002', 'EVT00000002'),
    ('CUR00000016', 'CHU00000001', 'CAL00000004', 'GRP00000030', 'EVT00000015'),
    ('CUR00000017', 'CHU00000001', 'CAL00000004', 'GRP00000022', 'EVT00000016'),
    ('CUR00000018', 'CHU00000001', 'CAL00000004', 'GRP00000021', 'EVT00000017');

    -- Blocks (Reusable Components)
    INSERT INTO blocks (id, churchId, blockType, name) VALUES
    -- Header and Footer Blocks
    ('BLK00000001', 'CHU00000001', 'header', 'Main Header'),
    ('BLK00000002', 'CHU00000001', 'footerBlock', 'Main Footer'),
    ('BLK00000003', 'CHU00000001', 'navigation', 'Main Navigation'),

    -- Reusable Content Blocks
    ('BLK00000004', 'CHU00000001', 'hero', 'Welcome Hero'),
    ('BLK00000005', 'CHU00000001', 'cta', 'Contact CTA'),
    ('BLK00000006', 'CHU00000001', 'feature', 'Ministry Feature'),
    ('BLK00000007', 'CHU00000001', 'testimonial', 'Member Testimonial'),
    ('BLK00000008', 'CHU00000001', 'event', 'Upcoming Event'),
    ('BLK00000009', 'CHU00000001', 'sermon', 'Latest Sermon'),
    ('BLK00000010', 'CHU00000001', 'gallery', 'Photo Gallery');

    -- Pages
    INSERT INTO pages (id, churchId, url, title, layout) VALUES
    ('PAG00000001', 'CHU00000001', '/', 'Home', 'default');

    -- Sections (Home Page)
    INSERT INTO sections (id, churchId, pageId, blockId, zone, background, textColor, headingColor, linkColor, sort, targetBlockId, answersJSON, stylesJSON, animationsJSON) VALUES
    -- Hero Section with background image
    ('SEC00000001', 'CHU00000001', 'PAG00000001', NULL, 'main', '/tempLibrary/backgrounds/worship.jpg', 'light', NULL, NULL, 1, NULL, NULL, NULL, NULL),

    -- Service Times Section
    ('SEC00000002', 'CHU00000001', 'PAG00000001', NULL, 'main', 'var(--light)', 'var(--accent)', 'var(--accent)', 'var(--darkAccent)', 2, NULL, NULL, NULL, NULL),

    -- About Pastor Section
    ('SEC00000003', 'CHU00000001', 'PAG00000001', NULL, 'main', '#FFFFFF', 'dark', NULL, NULL, 3, NULL, NULL, NULL, NULL),

    -- Ministries Section
    ('SEC00000004', 'CHU00000001', 'PAG00000001', NULL, 'main', '/tempLibrary/backgrounds/kids.jpg', 'light', NULL, NULL, 4, NULL, NULL, NULL, NULL),

    -- Latest Sermons Section
    ('SEC00000005', 'CHU00000001', 'PAG00000001', NULL, 'main', 'var(--dark)', 'var(--light)', 'var(--light)', 'var(--lightAccent)', 5, NULL, NULL, NULL, NULL),

    -- Main Church Calendar Section
    ('SEC00000008', 'CHU00000001', 'PAG00000001', NULL, 'main', '#FFFFFF', 'dark', NULL, NULL, 6, NULL, NULL, NULL, NULL),

    -- FAQ Section
    ('SEC00000006', 'CHU00000001', 'PAG00000001', NULL, 'main', '#f8f9fa', 'dark', NULL, NULL, 7, NULL, NULL, NULL, NULL),

    -- Contact & Location Section
    ('SEC00000007', 'CHU00000001', 'PAG00000001', NULL, 'main', '/tempLibrary/backgrounds/crowd.jpg', 'light', NULL, NULL, 8, NULL, NULL, NULL, NULL);

    -- Elements (Home Page)
    INSERT INTO elements (id, churchId, sectionId, blockId, elementType, sort, parentId, answersJSON, stylesJSON, animationsJSON) VALUES
    -- Hero Section
    ('ELE00000001', 'CHU00000001', 'SEC00000001', NULL, 'text', 1, NULL,
      '{"text": "<h1>Welcome to Grace Community Church</h1><h3><em>A place to belong, grow, and serve together</em></h3><p>Join us this Sunday as we worship, learn, and connect with God and each other.</p>", "textAlignment": "center"}',
      NULL,
      NULL),

    -- Service Times Section
    ('ELE00000002', 'CHU00000001', 'SEC00000002', NULL, 'text', 1, NULL,
      '{"text": "<h2>Sunday Service Times</h2><h3>Morning Worship: 9:00 AM &amp; 11:00 AM</h3><h3>Sunday School: 10:00 AM</h3><h3>Evening Service: 6:00 PM</h3><p><strong>What to Expect:</strong> Casual dress, friendly people, inspiring music, and biblical teaching that applies to your daily life.</p>", "textAlignment": "center"}',
      NULL,
      NULL),

    -- About Pastor Section with Photo
    ('ELE00000003', 'CHU00000001', 'SEC00000003', NULL, 'textWithPhoto', 1, NULL,
      '{"photoPosition": "right", "photo": "/tempLibrary/pastor.jpg", "text": "<h1>Meet Pastor John Smith</h1><p><strong>Welcome to our church family!</strong></p><p>Pastor John has been serving Grace Community Church since 2010. He is passionate about helping people discover God''s love and purpose for their lives.</p><p><strong>Education:</strong> M.Div. from Seminary, B.A. in Theology<br><strong>Family:</strong> Married to Sarah, father of three children<br><strong>Hobbies:</strong> Reading, hiking, and coffee</p><p><em>&quot;My heart''s desire is to see every person experience the transforming love of Jesus Christ.&quot;</em></p>"}',
      NULL,
      NULL),

    -- Ministries Section
    ('ELE00000004', 'CHU00000001', 'SEC00000004', NULL, 'row', 1, NULL,
      '{"columns": "3,3,3,3"}',
      NULL,
      NULL),

    ('ELE00000005', 'CHU00000001', 'SEC00000004', NULL, 'column', 1, 'ELE00000004',
      '{"size": 3}',
      NULL,
      NULL),

    ('ELE00000006', 'CHU00000001', 'SEC00000004', NULL, 'column', 2, 'ELE00000004',
      '{"size": 3}',
      NULL,
      NULL),

    ('ELE00000007', 'CHU00000001', 'SEC00000004', NULL, 'column', 3, 'ELE00000004',
      '{"size": 3}',
      NULL,
      NULL),

    ('ELE00000008', 'CHU00000001', 'SEC00000004', NULL, 'column', 4, 'ELE00000004',
      '{"size": 3}',
      NULL,
      NULL),

    ('ELE00000009', 'CHU00000001', 'SEC00000004', NULL, 'text', 1, 'ELE00000005',
      '{"text": "<h2>Children''s Ministry</h2><p>Nursery through 5th grade programs with engaging lessons, games, and activities that teach kids about God''s love.</p><p><strong>Ages:</strong> 0-11 years<br><strong>When:</strong> Every Sunday</p>", "textAlignment": "center"}',
      NULL,
      NULL),

    ('ELE00000010', 'CHU00000001', 'SEC00000004', NULL, 'text', 1, 'ELE00000006',
      '{"text": "<h2>Youth Ministry</h2><p>Middle and high school students connect through fun activities, deep discussions, and mission trips.</p><p><strong>Ages:</strong> 12-18 years<br><strong>When:</strong> Sundays &amp; Wednesdays</p>", "textAlignment": "center"}',
      NULL,
      NULL),

    ('ELE00000011', 'CHU00000001', 'SEC00000004', NULL, 'text', 1, 'ELE00000007',
      '{"text": "<h2>Small Groups</h2><p>Adult small groups meet throughout the week for Bible study, prayer, and fellowship in homes.</p><p><strong>When:</strong> Various times<br><strong>Where:</strong> Member homes</p>", "textAlignment": "center"}',
      NULL,
      NULL),

    ('ELE00000012', 'CHU00000001', 'SEC00000004', NULL, 'text', 1, 'ELE00000008',
      '{"text": "<h2>Music Ministry</h2><p>Worship team, choir, and special music opportunities for all ages and skill levels.</p><p><strong>Rehearsals:</strong> Thursdays<br><strong>Performances:</strong> Sundays</p>", "textAlignment": "center"}',
      NULL,
      NULL),

    -- Latest Sermons Section
    ('ELE00000013', 'CHU00000001', 'SEC00000005', NULL, 'text', 1, NULL,
      '{"text": "<h2>Latest Sermons</h2>", "textAlignment": "center"}',
      NULL,
      NULL),

    ('ELE00000014', 'CHU00000001', 'SEC00000005', NULL, 'row', 2, NULL,
      '{"columns": "6,6"}',
      NULL,
      NULL),

    ('ELE00000015', 'CHU00000001', 'SEC00000005', NULL, 'column', 1, 'ELE00000014',
      '{"size": 6}',
      NULL,
      NULL),

    ('ELE00000016', 'CHU00000001', 'SEC00000005', NULL, 'column', 2, 'ELE00000014',
      '{"size": 6}',
      NULL,
      NULL),

    ('ELE00000017', 'CHU00000001', 'SEC00000005', NULL, 'text', 1, 'ELE00000015',
      '{"text": "<h3>&quot;The Power of Faith&quot;</h3><p><strong>January 4, 2026</strong></p><p>Exploring how faith transforms our lives and strengthens our relationship with God. Join us as we dive into practical ways to grow in faith.</p><p><em>[Watch Online] [Download Audio]</em></p>"}',
      NULL,
      NULL),

    ('ELE00000018', 'CHU00000001', 'SEC00000005', NULL, 'text', 1, 'ELE00000016',
      '{"text": "<h3>&quot;Walking in Love&quot;</h3><p><strong>December 28, 2025</strong></p><p>Understanding God''s love and how to share it with others in our daily lives. A message of hope for the new year.</p><p><em>[Watch Online] [Download Audio]</em></p>"}',
      NULL,
      NULL),

    -- FAQ Section
    ('ELE00000019', 'CHU00000001', 'SEC00000006', NULL, 'text', 1, NULL,
      '{"text": "<h2>Frequently Asked Questions</h2>", "textAlignment": "center"}',
      NULL,
      NULL),

    ('ELE00000020', 'CHU00000001', 'SEC00000006', NULL, 'row', 2, NULL,
      '{"columns": "6,6"}',
      NULL,
      NULL),

    ('ELE00000021', 'CHU00000001', 'SEC00000006', NULL, 'column', 1, 'ELE00000020',
      '{"size": 6}',
      NULL,
      NULL),

    ('ELE00000022', 'CHU00000001', 'SEC00000006', NULL, 'column', 2, 'ELE00000020',
      '{"size": 6}',
      NULL,
      NULL),

    ('ELE00000023', 'CHU00000001', 'SEC00000006', NULL, 'text', 1, 'ELE00000021',
      '{"text": "<p><strong>What should I wear?</strong><br>Come as you are! We have people in everything from jeans to suits.</p><p><strong>What about my kids?</strong><br>We have age-appropriate programs for all children during services.</p><p><strong>Where do I park?</strong><br>Plenty of free parking is available in our lot and on surrounding streets.</p>"}',
      NULL,
      NULL),

    ('ELE00000024', 'CHU00000001', 'SEC00000006', NULL, 'text', 1, 'ELE00000022',
      '{"text": "<p><strong>How long is the service?</strong><br>Services typically last about 75 minutes including worship and message.</p><p><strong>Do I need to bring anything?</strong><br>Just yourself! Bibles and bulletins are provided.</p><p><strong>Can I get involved?</strong><br>Absolutely! We have ministries for every interest and skill level.</p>"}',
      NULL,
      NULL),

    -- Contact & Location Section
    ('ELE00000025', 'CHU00000001', 'SEC00000007', NULL, 'text', 1, NULL,
      '{"text": "<h2>Visit Us This Sunday</h2><p><strong>We would love to meet you!</strong></p><p>Come as you are and experience God''s love in our community.</p>", "textAlignment": "center"}',
      NULL,
      NULL),

    ('ELE00000026', 'CHU00000001', 'SEC00000007', NULL, 'row', 2, NULL,
      '{"columns": "6,6"}',
      NULL,
      NULL),

    ('ELE00000027', 'CHU00000001', 'SEC00000007', NULL, 'column', 1, 'ELE00000026',
      '{"size": 6}',
      NULL,
      NULL),

    ('ELE00000028', 'CHU00000001', 'SEC00000007', NULL, 'column', 2, 'ELE00000026',
      '{"size": 6}',
      NULL,
      NULL),

    ('ELE00000029', 'CHU00000001', 'SEC00000007', NULL, 'text', 1, 'ELE00000027',
      '{"text": "<h3>Contact Information</h3><p><strong>Address:</strong><br>123 Church Street<br>Anytown, USA 12345</p><p><strong>Phone:</strong> (555) 123-4567<br><strong>Email:</strong> info@gracechurch.org</p><p><strong>Office Hours:</strong><br>Monday-Friday: 9 AM - 5 PM</p>", "textAlignment": "center"}',
      NULL,
      NULL),

    ('ELE00000030', 'CHU00000001', 'SEC00000007', NULL, 'map', 1, 'ELE00000028',
      '{"mapAddress": "123 Church Street, Anytown, USA 12345", "mapZoom": "16"}',
      NULL,
      NULL),

    -- Main Church Calendar Section
    ('ELE00000031', 'CHU00000001', 'SEC00000008', NULL, 'text', 1, NULL,
      '{"text": "<h2>Upcoming Events</h2>", "textAlignment": "center"}',
      NULL,
      NULL),

    ('ELE00000032', 'CHU00000001', 'SEC00000008', NULL, 'text', 2, NULL,
      '{"text": "Stay connected with all the exciting things happening at Grace Community Church!", "textAlignment": "center"}',
      NULL,
      NULL),

    ('ELE00000033', 'CHU00000001', 'SEC00000008', NULL, 'calendar', 3, NULL,
      '{"calendarType": "curated", "calendarId": "CAL00000004"}',
      NULL,
      NULL);

    -- Playlists
    INSERT INTO playlists (id, churchId, title, description, publishDate, thumbnail) VALUES
    ('PLY00000001', 'CHU00000001', 'Sunday Sermons 2025-2026', 'Weekly sermons from our Sunday morning services', '2025-09-01 00:00:00', '/images/playlists/sunday-sermons.jpg'),
    ('PLY00000002', 'CHU00000001', 'Special Services', 'Recordings from special services and events', '2025-09-01 00:00:00', '/images/playlists/special-services.jpg'),
    ('PLY00000003', 'CHU00000001', 'Bible Study Series', 'In-depth Bible study sessions', '2025-09-01 00:00:00', '/images/playlists/bible-study.jpg'),
    ('PLY00000004', 'CHU00000001', 'Christmas Services', 'Special Christmas services and programs', '2025-09-01 00:00:00', '/images/playlists/christmas.jpg'),
    ('PLY00000005', 'CHU00000001', 'Easter Services', 'Easter services and special programs', '2025-09-01 00:00:00', '/images/playlists/easter.jpg');

    -- Sermons
    INSERT INTO sermons (id, churchId, playlistId, videoType, videoData, videoUrl, title, description, publishDate, thumbnail, duration, permanentUrl) VALUES
    -- Recent Sunday Sermons
    ('SER00000001', 'CHU00000001', 'PLY00000001', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'The Power of Faith', 'Exploring how faith transforms our lives and strengthens our relationship with God', '2026-01-04 10:00:00', '/images/sermons/power-of-faith.jpg', 3600, 1),
    ('SER00000002', 'CHU00000001', 'PLY00000001', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Walking in Love', 'Understanding God''s love and how to share it with others', '2025-12-28 10:00:00', '/images/sermons/walking-in-love.jpg', 3540, 1),
    ('SER00000003', 'CHU00000001', 'PLY00000001', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Finding Peace in Chaos', 'Discovering God''s peace in the midst of life''s challenges', '2025-12-21 10:00:00', '/images/sermons/finding-peace.jpg', 3720, 1),

    -- Special Services
    ('SER00000004', 'CHU00000001', 'PLY00000002', 'vimeo', '123456789', 'https://vimeo.com/123456789', 'Christmas Eve Service 2025', 'Our annual Christmas Eve candlelight service with carols and message', '2025-12-24 19:00:00', '/images/sermons/christmas-eve-2025.jpg', 5400, 1),
    ('SER00000005', 'CHU00000001', 'PLY00000002', 'vimeo', '987654321', 'https://vimeo.com/987654321', 'New Year''s Eve Service 2025', 'Special service celebrating the new year with worship and reflection', '2025-12-31 19:00:00', '/images/sermons/new-years-eve-2025.jpg', 4800, 1),

    -- Bible Study Series
    ('SER00000006', 'CHU00000001', 'PLY00000003', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Understanding the Book of Romans - Part 1', 'Introduction to Paul''s letter to the Romans', '2026-01-07 19:00:00', '/images/sermons/romans-part1.jpg', 2700, 1),
    ('SER00000007', 'CHU00000001', 'PLY00000003', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Understanding the Book of Romans - Part 2', 'Exploring the themes of grace and faith in Romans', '2026-01-14 19:00:00', '/images/sermons/romans-part2.jpg', 2700, 1),

    -- Christmas Services
    ('SER00000008', 'CHU00000001', 'PLY00000004', 'vimeo', '456789123', 'https://vimeo.com/456789123', 'Christmas Sunday Service 2025', 'Special Christmas morning service with carols and message', '2025-12-21 10:00:00', '/images/sermons/christmas-sunday-2025.jpg', 5400, 1),
    ('SER00000009', 'CHU00000001', 'PLY00000004', 'vimeo', '789123456', 'https://vimeo.com/789123456', 'Children''s Christmas Program 2025', 'Our annual children''s Christmas program', '2025-12-14 10:00:00', '/images/sermons/childrens-christmas-2025.jpg', 3600, 1),

    -- Easter Services
    ('SER00000010', 'CHU00000001', 'PLY00000005', 'vimeo', '321654987', 'https://vimeo.com/321654987', 'Good Friday Service 2025', 'Reflective service remembering Christ''s sacrifice', '2025-04-18 19:00:00', '/images/sermons/good-friday-2025.jpg', 3600, 1),
    ('SER00000011', 'CHU00000001', 'PLY00000005', 'vimeo', '654987321', 'https://vimeo.com/654987321', 'Easter Sunday Service 2025', 'Celebrating Christ''s resurrection', '2025-04-20 10:00:00', '/images/sermons/easter-sunday-2025.jpg', 5400, 1);

    -- Streaming Services
    INSERT INTO streamingServices (id, churchId, serviceTime, earlyStart, chatBefore, chatAfter, provider, providerKey, videoUrl, timezoneOffset, recurring, label, sermonId) VALUES
    -- Sunday Morning Service (Recurring) - Next Sunday
    ('STR00000001', 'CHU00000001',
        DATE_ADD(DATE_ADD(CURDATE(), INTERVAL (6 - WEEKDAY(CURDATE())) DAY), INTERVAL '10:00:00' HOUR_SECOND),
        900, 1800, 900, 'youtube', 'CHANNEL_ID_123', 'https://www.youtube.com/channel/CHANNEL_ID_123/live', -300, 1, 'Sunday Morning Service', 'SER00000001'),
    -- Always-on test service so /stream renders chat after every reset-demo;
    -- chat window is +/- 7 days around NOW().
    ('STR00000002', 'CHU00000001',
        NOW(),
        0, 604800, 604800, 'vimeo', 'CHANNEL_ID_TEST', 'https://vimeo.com/000000000', 0, 0, 'Always-Live Test Service', 'SER00000001');

    -- Settings
    INSERT INTO settings (id, churchId, keyName, `value`, public) VALUES
    ('SET00000001', 'CHU00000001', 'showLogin', 'true', 1);

    -- ========================================
    -- Event Registrations
    -- ========================================
    INSERT INTO registrations (id, churchId, eventId, personId, householdId, status, formSubmissionId, notes, registeredDate, cancelledDate) VALUES
    -- VBS Registrations (EVT00000015)
    ('REG00000001', 'CHU00000001', 'EVT00000015', 'PER00000036', 'HOU00000011', 'confirmed', NULL, NULL, '2025-11-15 09:00:00', NULL),
    ('REG00000002', 'CHU00000001', 'EVT00000015', 'PER00000027', 'HOU00000008', 'confirmed', NULL, 'Peanut allergy for Olivia', '2025-11-16 14:30:00', NULL),
    ('REG00000003', 'CHU00000001', 'EVT00000015', 'PER00000075', 'HOU00000023', 'confirmed', NULL, NULL, '2025-11-18 10:00:00', NULL),
    ('REG00000004', 'CHU00000001', 'EVT00000015', 'PER00000056', 'HOU00000016', 'pending', NULL, NULL, '2025-11-20 16:00:00', NULL),
    ('REG00000005', 'CHU00000001', 'EVT00000015', 'PER00000063', 'HOU00000019', 'cancelled', NULL, 'Family trip conflict', '2025-11-14 11:00:00', '2025-11-22 09:00:00'),
    -- Missions Conference Registrations (EVT00000016)
    ('REG00000006', 'CHU00000001', 'EVT00000016', 'PER00000044', 'HOU00000013', 'confirmed', NULL, NULL, '2025-12-01 08:00:00', NULL),
    ('REG00000007', 'CHU00000001', 'EVT00000016', 'PER00000021', 'HOU00000006', 'confirmed', NULL, NULL, '2025-12-02 12:00:00', NULL),
    ('REG00000008', 'CHU00000001', 'EVT00000016', 'PER00000082', 'HOU00000026', 'confirmed', NULL, NULL, '2025-12-03 15:00:00', NULL);

    -- ========================================
    -- Registration Members
    -- ========================================
    INSERT INTO registrationMembers (id, churchId, registrationId, personId, firstName, lastName) VALUES
    -- Hernandez VBS (REG00000001)
    ('RGM00000001', 'CHU00000001', 'REG00000001', 'PER00000038', 'Diego', 'Hernandez'),
    ('RGM00000002', 'CHU00000001', 'REG00000001', 'PER00000039', 'Valentina', 'Hernandez'),
    ('RGM00000003', 'CHU00000001', 'REG00000001', 'PER00000040', 'Gabriel', 'Hernandez'),
    ('RGM00000004', 'CHU00000001', 'REG00000001', 'PER00000041', 'Isabella', 'Hernandez'),
    -- Davis VBS (REG00000002)
    ('RGM00000005', 'CHU00000001', 'REG00000002', 'PER00000029', 'Olivia', 'Davis'),
    ('RGM00000006', 'CHU00000001', 'REG00000002', 'PER00000030', 'Noah', 'Davis'),
    -- White VBS (REG00000003)
    ('RGM00000007', 'CHU00000001', 'REG00000003', 'PER00000077', 'Jacob', 'White'),
    ('RGM00000008', 'CHU00000001', 'REG00000003', 'PER00000078', 'Madison', 'White'),
    -- Thomas VBS (REG00000004)
    ('RGM00000009', 'CHU00000001', 'REG00000004', 'PER00000058', 'Ethan', 'Thomas'),
    ('RGM00000010', 'CHU00000001', 'REG00000004', 'PER00000059', 'Abigail', 'Thomas'),
    -- Gonzalez Missions Conference (REG00000006)
    ('RGM00000011', 'CHU00000001', 'REG00000006', 'PER00000044', 'Roberto', 'Gonzalez'),
    ('RGM00000012', 'CHU00000001', 'REG00000006', 'PER00000045', 'Carmen', 'Gonzalez');

    -- ========================================
    -- Navigation Links
    -- ========================================
    INSERT INTO links (id, churchId, category, url, linkType, linkData, icon, text, sort, photo, parentId, visibility, groupIds) VALUES
    ('LNK00000001', 'CHU00000001', 'website', '/', 'url', NULL, 'home', 'Home', 1, NULL, NULL, 'everyone', NULL),
    ('LNK00000002', 'CHU00000001', 'website', '/about', 'url', NULL, 'info', 'About', 2, NULL, NULL, 'everyone', NULL),
    ('LNK00000003', 'CHU00000001', 'website', '/ministries', 'url', NULL, 'groups', 'Ministries', 3, NULL, NULL, 'everyone', NULL),
    ('LNK00000004', 'CHU00000001', 'website', '/sermons', 'url', NULL, 'play_circle', 'Sermons', 4, NULL, NULL, 'everyone', NULL),
    ('LNK00000005', 'CHU00000001', 'website', '/events', 'url', NULL, 'event', 'Events', 5, NULL, NULL, 'everyone', NULL),
    ('LNK00000006', 'CHU00000001', 'website', '/give', 'url', NULL, 'favorite', 'Give', 6, NULL, NULL, 'everyone', NULL),
    -- Streaming-page tab so /stream renders the live chat container.
    ('LNK00000007', 'CHU00000001', 'streamingTab', '', 'chat', NULL, 'chat', 'Chat', 1, NULL, NULL, 'everyone', NULL),
    -- B1 mobile dashboard tabs (b1Tab category) — these populate the mobile
    -- dashboard's hero/featured/quick actions sections and the side drawer.
    ('LNK00000010', 'CHU00000001', 'b1Tab', '', 'sermons', NULL, 'play_circle', 'Sermons', 1, NULL, NULL, 'everyone', NULL),
    ('LNK00000011', 'CHU00000001', 'b1Tab', '', 'bible', NULL, 'menu_book', 'Bible', 2, NULL, NULL, 'everyone', NULL),
    ('LNK00000012', 'CHU00000001', 'b1Tab', '', 'stream', NULL, 'live_tv', 'Live', 3, NULL, NULL, 'everyone', NULL),
    ('LNK00000013', 'CHU00000001', 'b1Tab', '', 'donation', NULL, 'volunteer_activism', 'Give', 4, NULL, NULL, 'everyone', NULL),
    ('LNK00000014', 'CHU00000001', 'b1Tab', '', 'votd', NULL, 'auto_stories', 'Verse of the Day', 5, NULL, NULL, 'everyone', NULL);

    -- ========================================
    -- Global Styles
    -- ========================================
    INSERT INTO globalStyles (id, churchId, fonts, palette, typography, spacing, borderRadius, customCss, customJS) VALUES
    ('GST00000001', 'CHU00000001',
      '{"heading": "Open Sans", "body": "Roboto"}',
      '{"light": "#FFFFFF", "lightAccent": "#E8F0FE", "accent": "#1976D2", "darkAccent": "#1565C0", "dark": "#212121"}',
      '{"headingSize": "2rem", "bodySize": "1rem"}',
      '{"sectionPadding": "60px", "elementSpacing": "20px"}',
      '{"button": "8px", "card": "12px"}',
      NULL,
      NULL);

    -- ========================================
    -- Files
    -- ========================================
    INSERT INTO files (id, churchId, contentType, contentId, fileName, contentPath, fileType, size, dateModified) VALUES
    ('FIL00000001', 'CHU00000001', 'church', 'CHU00000001', 'church-logo.png', '/content/CHU00000001/church-logo.png', 'image/png', 45000, '2025-09-01 10:00:00'),
    ('FIL00000002', 'CHU00000001', 'church', 'CHU00000001', 'sunday-bulletin.pdf', '/content/CHU00000001/sunday-bulletin.pdf', 'application/pdf', 250000, '2026-02-20 10:00:00'),
    ('FIL00000003', 'CHU00000001', 'church', 'CHU00000001', 'annual-report-2025.pdf', '/content/CHU00000001/annual-report-2025.pdf', 'application/pdf', 1200000, '2026-01-15 10:00:00');

END //
DELIMITER ;

-- Execute the stored procedure to populate demo data
CALL resetDemoData();

