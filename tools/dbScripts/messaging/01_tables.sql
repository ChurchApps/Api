-- Messaging module database schema
-- Real-time messaging and notification tables

-- Conversations table - message threads
CREATE TABLE IF NOT EXISTS conversations (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  title varchar(100),
  contentType varchar(20) DEFAULT 'conversation',
  contentId varchar(36),
  isPublic boolean DEFAULT false,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_conversations_church (churchId),
  INDEX idx_conversations_content (contentType, contentId)
);

-- Messages table - individual messages
CREATE TABLE IF NOT EXISTS messages (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  conversationId varchar(36) NOT NULL,
  userId varchar(36) NOT NULL,
  content TEXT NOT NULL,
  messageType varchar(20) DEFAULT 'text',
  attachments TEXT,
  timeSent datetime DEFAULT CURRENT_TIMESTAMP,
  removed boolean DEFAULT false,
  INDEX idx_messages_church (churchId),
  INDEX idx_messages_conversation (conversationId),
  INDEX idx_messages_user (userId),
  INDEX idx_messages_time (timeSent)
);

-- Notifications table - push/email notifications
CREATE TABLE IF NOT EXISTS notifications (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  personId varchar(36) NOT NULL,
  conversationId varchar(36),
  contentType varchar(20),
  contentId varchar(36),
  title varchar(100),
  message TEXT,
  url varchar(255),
  delivered boolean DEFAULT false,
  timeSent datetime DEFAULT CURRENT_TIMESTAMP,
  frequency varchar(20) DEFAULT 'individual',
  removed boolean DEFAULT false,
  INDEX idx_notifications_church (churchId),
  INDEX idx_notifications_person (personId),
  INDEX idx_notifications_conversation (conversationId),
  INDEX idx_notifications_delivered (delivered),
  INDEX idx_notifications_frequency (frequency)
);

-- WebSocket connections table
CREATE TABLE IF NOT EXISTS connections (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  userId varchar(36) NOT NULL,
  connectionId varchar(255) NOT NULL,
  ipAddress varchar(45),
  userAgent TEXT,
  connectedDate datetime DEFAULT CURRENT_TIMESTAMP,
  lastSeen datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_connections_church (churchId),
  INDEX idx_connections_user (userId),
  INDEX idx_connections_connectionId (connectionId)
);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS notificationPreferences (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  personId varchar(36) NOT NULL,
  contentType varchar(20) NOT NULL,
  frequency varchar(20) DEFAULT 'individual',
  allowPush boolean DEFAULT true,
  allowEmail boolean DEFAULT true,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_notificationPreferences_church (churchId),
  INDEX idx_notificationPreferences_person (personId),
  INDEX idx_notificationPreferences_contentType (contentType)
);

-- IP blocks table - security blocking
CREATE TABLE IF NOT EXISTS ipBlocks (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  ipAddress varchar(45) NOT NULL,
  reason varchar(255),
  blockedDate datetime DEFAULT CURRENT_TIMESTAMP,
  removed boolean DEFAULT false,
  INDEX idx_ipBlocks_church (churchId),
  INDEX idx_ipBlocks_ip (ipAddress)
);