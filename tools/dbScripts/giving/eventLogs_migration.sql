-- Migration script to update eventLogs table structure
-- This migrates from varchar(255) id with provider IDs to char(11) id with separate providerId field

-- Step 1: Add the new providerId column
ALTER TABLE `eventLogs`
ADD COLUMN `providerId` varchar(255) DEFAULT NULL,
ADD KEY `idx_provider_id` (`providerId`);

-- Step 2: Update existing records to move id values to providerId and generate new char(11) IDs
-- We'll use a temporary variable approach to generate sequential IDs
SET @counter = 0;
UPDATE `eventLogs`
SET
  `providerId` = `id`,
  `id` = CONCAT(
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1),
    SUBSTRING('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', FLOOR(1 + (RAND() * 36)), 1)
  )
WHERE `providerId` IS NULL;

-- Step 3: Alter the id column to char(11)
-- Note: This will require dropping and recreating the primary key
ALTER TABLE `eventLogs` DROP PRIMARY KEY;
ALTER TABLE `eventLogs` MODIFY COLUMN `id` char(11) NOT NULL;
ALTER TABLE `eventLogs` ADD PRIMARY KEY (`id`);

-- Verify the migration
SELECT 'Migration completed. Verify results:' as Status;
SELECT COUNT(*) as TotalRecords,
       COUNT(CASE WHEN LENGTH(id) = 11 THEN 1 END) as ValidIdCount,
       COUNT(CASE WHEN providerId IS NOT NULL THEN 1 END) as RecordsWithProviderId
FROM eventLogs;