-- Content module database schema
-- Content management and media tables

-- Pages table - website/app pages
CREATE TABLE IF NOT EXISTS pages (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  name varchar(50) NOT NULL,
  path varchar(100),
  title varchar(100),
  description TEXT,
  keywords varchar(255),
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pages_church (churchId),
  INDEX idx_pages_path (path)
);

-- Sections table - page sections/components
CREATE TABLE IF NOT EXISTS sections (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  pageId varchar(36) NOT NULL,
  zone varchar(20),
  sort int DEFAULT 0,
  background varchar(50),
  textColor varchar(20),
  targetAudience varchar(50),
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sections_church (churchId),
  INDEX idx_sections_page (pageId)
);

-- Elements table - content elements within sections
CREATE TABLE IF NOT EXISTS elements (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  sectionId varchar(36) NOT NULL,
  elementType varchar(50) NOT NULL,
  sort int DEFAULT 0,
  answers TEXT,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_elements_church (churchId),
  INDEX idx_elements_section (sectionId)
);

-- Media files table
CREATE TABLE IF NOT EXISTS media (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  fileName varchar(255) NOT NULL,
  contentType varchar(100),
  contentPath varchar(255),
  thumbPath varchar(255),
  fileSize bigint,
  seconds int,
  dateCreated datetime DEFAULT CURRENT_TIMESTAMP,
  removed boolean DEFAULT false,
  INDEX idx_media_church (churchId)
);

-- Sermons table - sermon content and metadata
CREATE TABLE IF NOT EXISTS sermons (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  title varchar(100) NOT NULL,
  description TEXT,
  speaker varchar(100),
  sermonDate date,
  series varchar(100),
  videoUrl varchar(255),
  audioUrl varchar(255),
  notes TEXT,
  thumbnail varchar(255),
  duration int,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sermons_church (churchId),
  INDEX idx_sermons_date (sermonDate),
  INDEX idx_sermons_series (series)
);

-- Playlists table - media playlists
CREATE TABLE IF NOT EXISTS playlists (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  name varchar(100) NOT NULL,
  description TEXT,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_playlists_church (churchId)
);

-- Playlist items table
CREATE TABLE IF NOT EXISTS playlistItems (
  id varchar(36) NOT NULL PRIMARY KEY,
  churchId varchar(36) NOT NULL,
  playlistId varchar(36) NOT NULL,
  mediaId varchar(36),
  sermonId varchar(36),
  sort int DEFAULT 0,
  removed boolean DEFAULT false,
  createdDate datetime DEFAULT CURRENT_TIMESTAMP,
  modifiedDate datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_playlistItems_church (churchId),
  INDEX idx_playlistItems_playlist (playlistId),
  INDEX idx_playlistItems_media (mediaId),
  INDEX idx_playlistItems_sermon (sermonId)
);