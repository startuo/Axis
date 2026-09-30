CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('posts','anime','diary','albums')),
  slug TEXT NOT NULL,
  sourceKey TEXT UNIQUE,
  draft TEXT NOT NULL CHECK(json_valid(draft)),
  published TEXT CHECK(published IS NULL OR json_valid(published)),
  version INTEGER NOT NULL DEFAULT 1,
  deletedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(kind,slug)
);
CREATE INDEX entries_public ON entries(kind,deletedAt,updatedAt);
CREATE TABLE content_routes (path TEXT PRIMARY KEY, entryId TEXT NOT NULL REFERENCES entries(id));
CREATE TABLE publication_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO publication_state(id,revision) VALUES(1,0);
CREATE TABLE mirror_jobs (
  revision INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0, error TEXT, snapshotKey TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
);
CREATE TABLE profiles (
  userId TEXT PRIMARY KEY REFERENCES users(id), nickname TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '', avatarUrl TEXT NOT NULL DEFAULT '', readingHistory INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE user_entries (
  userId TEXT NOT NULL REFERENCES users(id), entryId TEXT NOT NULL REFERENCES entries(id),
  kind TEXT NOT NULL CHECK(kind IN ('favorites','history')), updatedAt TEXT NOT NULL,
  PRIMARY KEY(userId,entryId,kind)
);
CREATE TABLE media (
  id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL,
  createdAt TEXT NOT NULL, deletedAt TEXT
);
CREATE TABLE media_refs (
  mediaId TEXT NOT NULL REFERENCES media(id), owner TEXT NOT NULL,
  PRIMARY KEY(mediaId,owner)
);
-- Preserve legacy D1 articles and their identifiers; do not delete the source table.
INSERT INTO entries(id,kind,slug,sourceKey,draft,published,createdAt,updatedAt)
SELECT id,'posts',slug,'legacy:'||id,
 json_object('title',title,'content',content,'description',summary,'image',COALESCE(coverImage,''),'category',COALESCE(category,''),'tags',json(tags),'published',COALESCE(publishedAt,createdAt),'url','/posts/'||slug||'/'),
 CASE WHEN status='PUBLISHED' THEN json_object('title',title,'content',content,'description',summary,'image',COALESCE(coverImage,''),'category',COALESCE(category,''),'tags',json(tags),'published',COALESCE(publishedAt,createdAt),'url','/posts/'||slug||'/') ELSE NULL END,
 createdAt,updatedAt FROM articles;
INSERT INTO content_routes(path,entryId) SELECT '/posts/'||slug||'/',id FROM entries WHERE kind='posts';

CREATE TABLE mutation_guard (value INTEGER NOT NULL CHECK(value=1));
