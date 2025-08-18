CREATE PROCEDURE `updateConversationStats`(convId  char(11))
BEGIN
	UPDATE conversations 
	set postCount=(SELECT COUNT(*) FROM messages where churchId=conversations.churchId and conversationId=conversations.id),
	firstPostId=(SELECT id FROM messages where churchId=conversations.churchId and conversationId=conversations.id ORDER BY timeSent LIMIT 1),
	lastPostId=(SELECT id FROM messages where churchId=conversations.churchId and conversationId=conversations.id ORDER BY timeSent DESC LIMIT 1)
	WHERE id=convId;
END$$
