import { ArticleStatus, PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';

const prisma = new PrismaClient();

const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@stars.blog';
const adminUsername = process.env.ADMIN_USERNAME ?? 'star';

function getRequiredAdminPassword(): string {
  const value = process.env.ADMIN_PASSWORD;

  if (!value) {
    throw new Error(
      'ADMIN_PASSWORD is required before seeding the admin account.',
    );
  }

  return value;
}

const adminPassword = getRequiredAdminPassword();

async function seedAdminUser() {
  const passwordHash = await argon2.hash(adminPassword);
  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [{ email: adminEmail.toLowerCase() }, { username: adminUsername }],
    },
  });

  if (existingAdmin) {
    return prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        email: adminEmail.toLowerCase(),
        username: adminUsername,
        passwordHash,
        role: Role.ADMIN,
      },
    });
  }

  return prisma.user.create({
    data: {
      email: adminEmail.toLowerCase(),
      username: adminUsername,
      passwordHash,
      role: Role.ADMIN,
    },
  });
}

async function seedDemoArticle(authorId: string) {
  await syncMarkdownArticles(authorId);
  await archiveLegacyDemoArticle();
}

type FrontmatterValue = string | string[] | boolean;
type Frontmatter = Record<string, FrontmatterValue>;

function getRepositoryRoot() {
  return resolve(process.cwd(), '../..');
}

function listMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return listMarkdownFiles(fullPath);
    }

    return extname(entry).toLowerCase() === '.md' ? [fullPath] : [];
  });
}

function splitFrontmatter(raw: string) {
  if (!raw.startsWith('---')) {
    return {
      frontmatter: {},
      body: raw.trim(),
    };
  }

  const endIndex = raw.indexOf('\n---', 3);
  if (endIndex === -1) {
    return {
      frontmatter: {},
      body: raw.trim(),
    };
  }

  const frontmatterText = raw.slice(3, endIndex).trim();
  const body = raw.slice(endIndex + 4).trim();

  return {
    frontmatter: parseFrontmatter(frontmatterText),
    body,
  };
}

function parseFrontmatter(text: string): Frontmatter {
  const result: Frontmatter = {};
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const trimmedValue = rawValue.trim();

    if (trimmedValue === '') {
      const values: string[] = [];
      while (index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
        index += 1;
        values.push(cleanScalar(lines[index].replace(/^\s+-\s+/, '')));
      }

      result[key] = values;
      continue;
    }

    if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
      result[key] = trimmedValue
        .slice(1, -1)
        .split(',')
        .map((item) => cleanScalar(item))
        .filter(Boolean);
      continue;
    }

    if (trimmedValue === 'true' || trimmedValue === 'false') {
      result[key] = trimmedValue === 'true';
      continue;
    }

    result[key] = cleanScalar(trimmedValue);
  }

  return result;
}

function cleanScalar(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function getString(frontmatter: Frontmatter, key: string) {
  const value = frontmatter[key];
  return typeof value === 'string' ? value : undefined;
}

function getStringArray(frontmatter: Frontmatter, key: string) {
  const value = frontmatter[key];
  if (Array.isArray(value)) {
    return value;
  }

  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function getBoolean(frontmatter: Frontmatter, key: string) {
  const value = frontmatter[key];
  return typeof value === 'boolean' ? value : false;
}

function createSummary(body: string, fallback: string) {
  const text = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[[^\]]*]\([^)]*\)/g, '')
    .replace(/[#>*_`~|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (text || fallback).slice(0, 500);
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseDate(value: string | undefined) {
  if (!value) {
    return new Date();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function syncMarkdownArticles(authorId: string) {
  const postsDir = resolve(getRepositoryRoot(), 'src/content/posts');
  const markdownFiles = listMarkdownFiles(postsDir);

  for (const file of markdownFiles) {
    const raw = readFileSync(file, 'utf8');
    const { frontmatter, body } = splitFrontmatter(raw);
    const relativePath = relative(postsDir, file).split(sep).join('/');
    const fallbackSlug = relativePath.replace(/\.md$/i, '');
    const title = getString(frontmatter, 'title') ?? basename(file, '.md');
    const slug = normalizeSlug(getString(frontmatter, 'slug') ?? fallbackSlug);
    const publishedAt = parseDate(
      getString(frontmatter, 'published') ?? getString(frontmatter, 'updated'),
    );
    const tags = getStringArray(frontmatter, 'tags');
    const category =
      getString(frontmatter, 'category') ??
      getStringArray(frontmatter, 'categories')[0] ??
      null;
    const coverImage =
      getString(frontmatter, 'image') ?? getString(frontmatter, 'cover') ?? null;
    const summary =
      getString(frontmatter, 'description') ?? createSummary(body, title);
    const status = getBoolean(frontmatter, 'draft')
      ? ArticleStatus.DRAFT
      : ArticleStatus.PUBLISHED;

    await prisma.article.upsert({
      where: { slug },
      create: {
        title,
        slug,
        summary,
        content: body,
        coverImage,
        category,
        tags,
        status,
        publishedAt: status === ArticleStatus.PUBLISHED ? publishedAt : null,
        authorId,
      },
      update: {
        title,
        summary,
        content: body,
        coverImage,
        category,
        tags,
        status,
        publishedAt: status === ArticleStatus.PUBLISHED ? publishedAt : null,
        authorId,
      },
    });
  }

  console.log(`Synced markdown articles: ${markdownFiles.length}`);
}

async function archiveLegacyDemoArticle() {
  const legacySlug = 'welcome-to-stars-blog-admin';
  const existingArticle = await prisma.article.findUnique({
    where: { slug: legacySlug },
    select: { id: true, status: true },
  });

  if (!existingArticle || existingArticle.status === ArticleStatus.DRAFT) {
    return;
  }

  await prisma.article.update({
    where: { id: existingArticle.id },
    data: {
      status: ArticleStatus.DRAFT,
      publishedAt: null,
    },
  });

  console.log(`Archived legacy demo article: ${legacySlug}`);
}

async function main() {
  const admin = await seedAdminUser();
  await seedDemoArticle(admin.id);

  console.log('Seed completed.');
  console.log(`Admin email: ${adminEmail}`);
  console.log(`Admin username: ${adminUsername}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
