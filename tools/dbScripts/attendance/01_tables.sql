-- Attendance module database schema
-- Attendance tracking and reporting tables

-- Campuses table - physical locations for services
CREATE TABLE IF NOT EXISTS campuses (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  name varchar(50) NOT NULL,
  address1 varchar(100),
  address2 varchar(100),
  city varchar(50),
  state varchar(50),
  zip varchar(20),
  country varchar(50) DEFAULT 'US',
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_campuses_church (churchId)
);

-- Services table - different service types (Sunday morning, evening, etc.)
CREATE TABLE IF NOT EXISTS services (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  campusId varchar(36) NOT NULL,
  name varchar(50) NOT NULL,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_services_church (churchId),
  INDEX idx_services_campus (campusId)
);

-- Service times table - scheduled meeting times
CREATE TABLE IF NOT EXISTS serviceTimes (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  serviceId varchar(36) NOT NULL,
  name varchar(50) NOT NULL,
  longName varchar(100),
  description TEXT,
  duration int DEFAULT 60,
  earlyMinutes int DEFAULT 15,
  lateMinutes int DEFAULT 15,
  chatBefore boolean DEFAULT true,
  chatAfter boolean DEFAULT true,
  callToAction varchar(255),
  videoUrl varchar(255),
  timezoneId varchar(50),
  recurringPattern varchar(50),
  startTime time,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_serviceTimes_church (churchId),
  INDEX idx_serviceTimes_service (serviceId)
);

-- Sessions table - specific instances of service times
CREATE TABLE IF NOT EXISTS sessions (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  serviceTimeId varchar(36) NOT NULL,
  groupId varchar(36),
  sessionDate date NOT NULL,
  displayName varchar(100),
  serviceDate datetime,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sessions_church (churchId),
  INDEX idx_sessions_serviceTime (serviceTimeId),
  INDEX idx_sessions_group (groupId),
  INDEX idx_sessions_date (sessionDate)
);

-- Visits table - individual person attendance records
CREATE TABLE IF NOT EXISTS visits (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  personId varchar(36) NOT NULL,
  serviceId varchar(36),
  groupId varchar(36),
  visitDate date NOT NULL,
  visitSessions int DEFAULT 1,
  checkinTime datetime,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_visits_church (churchId),
  INDEX idx_visits_person (personId),
  INDEX idx_visits_service (serviceId),
  INDEX idx_visits_group (groupId),
  INDEX idx_visits_date (visitDate)
);

-- Visit sessions table - detailed session attendance
CREATE TABLE IF NOT EXISTS visitSessions (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  visitId varchar(36) NOT NULL,
  sessionId varchar(36) NOT NULL,
  checkinTime datetime,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_visitSessions_church (churchId),
  INDEX idx_visitSessions_visit (visitId),
  INDEX idx_visitSessions_session (sessionId)
);

-- Attendance settings table - configuration per church
CREATE TABLE IF NOT EXISTS attendanceSettings (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  allowSelfCheckin boolean DEFAULT false,
  requireGroupSelection boolean DEFAULT false,
  showGroupSelection boolean DEFAULT true,
  defaultServiceId varchar(36),
  checkinMinutes int DEFAULT 15,
  checkoutMinutes int DEFAULT 15,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_attendanceSettings_church (churchId)
);