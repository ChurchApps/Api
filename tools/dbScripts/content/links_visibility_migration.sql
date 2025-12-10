-- Migration: Add visibility and groupIds columns to links table
-- Run this manually before deploying the new code

-- Add new columns
ALTER TABLE links ADD COLUMN visibility VARCHAR(45) DEFAULT 'everyone';
ALTER TABLE links ADD COLUMN groupIds TEXT DEFAULT NULL;

-- Migrate existing b1Tab links to appropriate visibility based on linkType
UPDATE links SET visibility = 'everyone'
  WHERE category = 'b1Tab' AND visibility IS NULL
  AND linkType IN ('bible', 'votd', 'sermons', 'stream', 'donation', 'url', 'page', 'website', 'donationLanding');

UPDATE links SET visibility = 'visitors'
  WHERE category = 'b1Tab' AND visibility IS NULL
  AND linkType IN ('groups', 'lessons', 'checkin');

UPDATE links SET visibility = 'members'
  WHERE category = 'b1Tab' AND visibility IS NULL
  AND linkType = 'directory';

UPDATE links SET visibility = 'team'
  WHERE category = 'b1Tab' AND visibility IS NULL
  AND linkType = 'plans';

-- Set remaining null visibility to 'everyone' as default
UPDATE links SET visibility = 'everyone'
  WHERE visibility IS NULL;

-- =====================================================
-- INSERT links for churches that met old hardcoded rules
-- (Only insert if church doesn't already have this tab)
-- =====================================================

-- Sermons tab: Churches with at least 1 sermon
INSERT INTO links (id, churchId, category, linkType, linkData, icon, text, sort, visibility)
SELECT UUID(), s.churchId, 'b1Tab', 'sermons', '', 'video_library', 'Sermons', 1, 'everyone'
FROM (SELECT DISTINCT churchId FROM sermons) s
WHERE NOT EXISTS (
  SELECT 1 FROM links l
  WHERE l.churchId = s.churchId COLLATE utf8mb4_unicode_520_ci AND l.category = 'b1Tab' AND l.linkType = 'sermons'
);

-- Stream tab: Churches with at least 1 streaming service
INSERT INTO links (id, churchId, category, linkType, linkData, icon, text, sort, visibility)
SELECT UUID(), ss.churchId, 'b1Tab', 'stream', '', 'live_tv', 'Live Stream', 2, 'everyone'
FROM (SELECT DISTINCT churchId FROM streamingServices) ss
WHERE NOT EXISTS (
  SELECT 1 FROM links l
  WHERE l.churchId = ss.churchId COLLATE utf8mb4_unicode_520_ci AND l.category = 'b1Tab' AND l.linkType = 'stream'
);

-- Donation tab: Churches with a gateway configured (cross-database query - run on giving DB)
-- NOTE: This requires access to the giving database. Run this separately:
-- INSERT INTO content.links (id, churchId, category, linkType, linkData, icon, text, sort, visibility)
-- SELECT UUID(), g.churchId, 'b1Tab', 'donation', '', 'volunteer_activism', 'Give', 3, 'everyone'
-- FROM (SELECT DISTINCT churchId FROM giving.gateways WHERE privateKey IS NOT NULL AND privateKey != '') g
-- WHERE NOT EXISTS (
--   SELECT 1 FROM content.links l
--   WHERE l.churchId = g.churchId COLLATE utf8mb4_unicode_520_ci AND l.category = 'b1Tab' AND l.linkType = 'donation'
-- );

-- Groups tab: All churches (this was available to all visitors with an account)
-- Only add for churches that have at least one group
INSERT INTO links (id, churchId, category, linkType, linkData, icon, text, sort, visibility)
SELECT UUID(), c.id COLLATE utf8mb4_unicode_520_ci, 'b1Tab', 'groups', '', 'groups', 'Groups', 4, 'visitors'
FROM (SELECT DISTINCT id FROM membership.churches) c
WHERE NOT EXISTS (
  SELECT 1 FROM links l
  WHERE l.churchId = c.id COLLATE utf8mb4_unicode_520_ci AND l.category = 'b1Tab' AND l.linkType = 'groups'
);

-- Directory tab: All churches (available to members)
INSERT INTO links (id, churchId, category, linkType, linkData, icon, text, sort, visibility)
SELECT UUID(), c.id COLLATE utf8mb4_unicode_520_ci, 'b1Tab', 'directory', '', 'contacts', 'Directory', 5, 'members'
FROM (SELECT DISTINCT id FROM membership.churches) c
WHERE NOT EXISTS (
  SELECT 1 FROM links l
  WHERE l.churchId = c.id COLLATE utf8mb4_unicode_520_ci AND l.category = 'b1Tab' AND l.linkType = 'directory'
);

-- Plans tab: All churches (available to team members)
INSERT INTO links (id, churchId, category, linkType, linkData, icon, text, sort, visibility)
SELECT UUID(), c.id COLLATE utf8mb4_unicode_520_ci, 'b1Tab', 'plans', '', 'assignment', 'Plans', 6, 'team'
FROM (SELECT DISTINCT id FROM membership.churches) c
WHERE NOT EXISTS (
  SELECT 1 FROM links l
  WHERE l.churchId = c.id COLLATE utf8mb4_unicode_520_ci AND l.category = 'b1Tab' AND l.linkType = 'plans'
);

-- Check-in tab: Churches with at least 1 campus
-- NOTE: This requires access to the attendance database. Run this separately:
-- INSERT INTO content.links (id, churchId, category, linkType, linkData, icon, text, sort, visibility)
-- SELECT UUID(), ca.churchId, 'b1Tab', 'checkin', '', 'check_circle', 'Check-in', 7, 'visitors'
-- FROM (SELECT DISTINCT churchId FROM attendance.campuses) ca
-- WHERE NOT EXISTS (
--   SELECT 1 FROM content.links l
--   WHERE l.churchId = ca.churchId COLLATE utf8mb4_unicode_520_ci AND l.category = 'b1Tab' AND l.linkType = 'checkin'
-- );

-- Lessons tab: All churches (available to visitors enrolled in classrooms)
INSERT INTO links (id, churchId, category, linkType, linkData, icon, text, sort, visibility)
SELECT UUID(), c.id COLLATE utf8mb4_unicode_520_ci, 'b1Tab', 'lessons', '', 'school', 'Lessons', 8, 'visitors'
FROM (SELECT DISTINCT id FROM membership.churches) c
WHERE NOT EXISTS (
  SELECT 1 FROM links l
  WHERE l.churchId = c.id COLLATE utf8mb4_unicode_520_ci AND l.category = 'b1Tab' AND l.linkType = 'lessons'
);
