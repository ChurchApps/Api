DROP PROCEDURE IF EXISTS `deleteForChurch`;

DELIMITER $$
CREATE PROCEDURE `deleteForChurch`(IN pChurchId char(11))
BEGIN
	DELETE FROM connections where churchId=pChurchId;
    DELETE FROM conversations where churchId=pChurchId;
    DELETE FROM devices where churchId=pChurchId;
    DELETE FROM messages where churchId=pChurchId;
    DELETE FROM notificationPreferences where churchId=pChurchId;
    DELETE FROM notifications where churchId=pChurchId;
    DELETE FROM privateMessages where churchId=pChurchId;
    DELETE FROM sentTexts where churchId=pChurchId;
    DELETE FROM textingProviders where churchId=pChurchId;
END$$
DELIMITER ;
