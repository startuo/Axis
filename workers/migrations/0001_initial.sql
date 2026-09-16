CREATE TABLE users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE, passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','ADMIN')),
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE TABLE articles (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL, summary TEXT NOT NULL, coverImage TEXT, category TEXT,
  tags TEXT NOT NULL DEFAULT '[]', viewCount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
  publishedAt TEXT, authorId TEXT NOT NULL REFERENCES users(id),
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE INDEX articles_status_date ON articles(status, publishedAt);
CREATE INDEX articles_updated ON articles(updatedAt);
CREATE TABLE feedback_messages (
  id TEXT PRIMARY KEY, text TEXT NOT NULL, color TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  authorId TEXT NOT NULL REFERENCES users(id), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE INDEX feedback_status_date ON feedback_messages(status, createdAt);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX rate_expiry ON rate_limits(expires);
CREATE TABLE visitors (id TEXT PRIMARY KEY, lastSeen INTEGER NOT NULL);
CREATE INDEX visitors_seen ON visitors(lastSeen);
CREATE TABLE article_reads (
  day TEXT NOT NULL, articleId TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  visitor TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(day,articleId,visitor)
);
