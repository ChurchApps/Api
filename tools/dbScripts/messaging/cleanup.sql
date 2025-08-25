DROP PROCEDURE IF EXISTS `cleanup`;

DELIMITER $$
CREATE PROCEDURE `cleanup`()
BEGIN
  DELETE from conversations where allowAnonymousPosts=1 AND dateCreated<DATE_ADD(now(), INTERVAL -7 DAY);
  DELETE from connections where timeJoined < DATE_ADD(now(), INTERVAL -1 DAY);
  DELETE from messages where conversationId NOT IN (SELECT id from conversations);
END$$
DELIMITER ;