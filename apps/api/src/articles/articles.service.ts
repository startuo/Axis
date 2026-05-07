import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Article, ArticleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SafeUser } from '../users/interfaces/safe-user.interface';
import { AdminArticlesQueryDto } from './dto/admin-articles-query.dto';
import { CreateArticleDto } from './dto/create-article.dto';
import { PublicArticlesQueryDto } from './dto/public-articles-query.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleViewsService } from './article-views.service';

type ArticleWithAuthor = Article & {
  author: {
    id: string;
    username: string;
  };
};

@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articleViewsService: ArticleViewsService,
  ) {}

  async listPublicArticles(query: PublicArticlesQueryDto) {
    const where: Prisma.ArticleWhereInput = {
      status: ArticleStatus.PUBLISHED,
    };

    if (query.category) {
      where.category = query.category;
    }

    if (query.tag) {
      where.tags = {
        has: query.tag,
      };
    }

    if (query.keyword) {
      where.OR = [
        {
          title: {
            contains: query.keyword,
            mode: 'insensitive',
          },
        },
        {
          summary: {
            contains: query.keyword,
            mode: 'insensitive',
          },
        },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;

    const [total, articles] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          author: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      }),
    ]);

    const items = await this.articleViewsService.mergeLiveViewCounts(articles);

    return {
      items: items.map((article) => this.toPublicListItem(article)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getPublishedArticleDetail(slug: string) {
    const article = await this.prisma.article.findFirst({
      where: {
        slug,
        status: ArticleStatus.PUBLISHED,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!article) {
      throw new NotFoundException('Published article not found');
    }

    const liveViewCount =
      await this.articleViewsService.incrementAndGetLiveViewCount(
        article.id,
        article.viewCount,
      );

    return this.toPublicDetail(article, liveViewCount);
  }

  async listAdminArticles(query: AdminArticlesQueryDto) {
    const where: Prisma.ArticleWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.keyword) {
      where.OR = [
        {
          title: {
            contains: query.keyword,
            mode: 'insensitive',
          },
        },
        {
          summary: {
            contains: query.keyword,
            mode: 'insensitive',
          },
        },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;

    const [total, articles] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          author: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      }),
    ]);

    const items = await this.articleViewsService.mergeLiveViewCounts(articles);

    return {
      items: items.map((article) => this.toAdminArticle(article)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getAdminArticleById(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const [withLiveViews] = await this.articleViewsService.mergeLiveViewCounts([
      article,
    ]);
    return this.toAdminArticle(withLiveViews);
  }

  async createArticle(dto: CreateArticleDto, user: SafeUser) {
    const slug = await this.ensureUniqueSlug(
      this.normalizeSlug(dto.slug ?? dto.title),
    );

    const status = dto.status ?? ArticleStatus.DRAFT;
    const publishedAt =
      status === ArticleStatus.PUBLISHED
        ? this.resolvePublishedAt(dto.publishedAt)
        : null;

    try {
      const article = await this.prisma.article.create({
        data: {
          title: dto.title,
          slug,
          content: dto.content,
          summary: dto.summary,
          coverImage: dto.coverImage,
          category: dto.category,
          tags: dto.tags ?? [],
          status,
          publishedAt,
          authorId: user.id,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      return this.toAdminArticle(article);
    } catch (error) {
      this.handleArticlePrismaError(error);
    }
  }

  async updateArticle(id: string, dto: UpdateArticleDto) {
    const existingArticle = await this.prisma.article.findUnique({
      where: { id },
    });

    if (!existingArticle) {
      throw new NotFoundException('Article not found');
    }

    const nextStatus = dto.status ?? existingArticle.status;
    const nextSlug = dto.slug
      ? await this.ensureUniqueSlug(this.normalizeSlug(dto.slug), id)
      : existingArticle.slug;

    const publishedAt = this.resolveNextPublishedAt(existingArticle, dto);

    try {
      const article = await this.prisma.article.update({
        where: { id },
        data: {
          title: dto.title ?? existingArticle.title,
          slug: nextSlug,
          content: dto.content ?? existingArticle.content,
          summary: dto.summary ?? existingArticle.summary,
          coverImage:
            dto.coverImage === undefined
              ? existingArticle.coverImage
              : dto.coverImage,
          category:
            dto.category === undefined
              ? existingArticle.category
              : dto.category,
          tags: dto.tags ?? existingArticle.tags,
          status: nextStatus,
          publishedAt,
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      const [withLiveViews] =
        await this.articleViewsService.mergeLiveViewCounts([article]);

      return this.toAdminArticle(withLiveViews);
    } catch (error) {
      this.handleArticlePrismaError(error);
    }
  }

  async deleteArticle(id: string) {
    const existingArticle = await this.prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
      },
    });

    if (!existingArticle) {
      throw new NotFoundException('Article not found');
    }

    await this.prisma.article.delete({
      where: { id },
    });

    return {
      id: existingArticle.id,
      title: existingArticle.title,
      slug: existingArticle.slug,
      deleted: true,
    };
  }

  private resolveNextPublishedAt(
    existingArticle: Article,
    dto: UpdateArticleDto,
  ): Date | null {
    const nextStatus = dto.status ?? existingArticle.status;

    if (nextStatus === ArticleStatus.DRAFT) {
      return null;
    }

    if (dto.publishedAt) {
      return this.resolvePublishedAt(dto.publishedAt);
    }

    return existingArticle.publishedAt ?? new Date();
  }

  private resolvePublishedAt(value?: string): Date {
    if (!value) {
      return new Date();
    }

    return new Date(value);
  }

  private async ensureUniqueSlug(
    baseSlug: string,
    excludeId?: string,
  ): Promise<string> {
    const normalizedBase = baseSlug || `article-${Date.now()}`;
    let candidate = normalizedBase;
    let suffix = 2;

    while (true) {
      const existing = await this.prisma.article.findFirst({
        where: {
          slug: candidate,
          ...(excludeId
            ? {
                NOT: {
                  id: excludeId,
                },
              }
            : {}),
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return candidate;
      }

      candidate = `${normalizedBase}-${suffix}`;
      suffix += 1;
    }
  }

  private normalizeSlug(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || `article-${Date.now()}`;
  }

  private toPublicListItem(article: ArticleWithAuthor) {
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      coverImage: article.coverImage,
      category: article.category,
      tags: article.tags,
      viewCount: article.viewCount,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      author: article.author,
    };
  }

  private toPublicDetail(article: ArticleWithAuthor, viewCount: number) {
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content,
      summary: article.summary,
      coverImage: article.coverImage,
      category: article.category,
      tags: article.tags,
      viewCount,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      author: article.author,
    };
  }

  private toAdminArticle(article: ArticleWithAuthor) {
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      content: article.content,
      summary: article.summary,
      coverImage: article.coverImage,
      category: article.category,
      tags: article.tags,
      viewCount: article.viewCount,
      status: article.status,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      author: article.author,
    };
  }

  private handleArticlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Article slug already exists');
    }

    throw error;
  }
}
