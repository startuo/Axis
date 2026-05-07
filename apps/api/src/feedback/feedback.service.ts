import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackMessage, FeedbackStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SafeUser } from '../users/interfaces/safe-user.interface';
import { AdminFeedbackQueryDto } from './dto/admin-feedback-query.dto';
import { CreateFeedbackMessageDto } from './dto/create-feedback-message.dto';

type FeedbackWithAuthor = FeedbackMessage & {
  author: {
    id: string;
    username: string;
    email: string;
  };
};

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 5;
const DEFAULT_DANMAKU_COLOR = '#fb78ad';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createMessage(dto: CreateFeedbackMessageDto, user: SafeUser) {
    await this.enforceSubmitRateLimit(user.id);

    const message = await this.prisma.feedbackMessage.create({
      data: {
        text: dto.text.trim(),
        color: this.normalizeColor(dto.color),
        authorId: user.id,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    return this.toAdminMessage(message);
  }

  async listPublicMessages(limit = 80) {
    const messages = await this.prisma.feedbackMessage.findMany({
      where: {
        status: FeedbackStatus.APPROVED,
      },
      take: Math.min(Math.max(limit, 1), 100),
      orderBy: {
        createdAt: 'desc',
      },
    });

    return messages.reverse().map((message) => this.toPublicMessage(message));
  }

  async listAdminMessages(query: AdminFeedbackQueryDto) {
    const where: Prisma.FeedbackMessageWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    const skip = (query.page - 1) * query.pageSize;

    const [total, messages] = await Promise.all([
      this.prisma.feedbackMessage.count({ where }),
      this.prisma.feedbackMessage.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      items: messages.map((message) => this.toAdminMessage(message)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async updateMessageStatus(id: string, status: FeedbackStatus) {
    const existingMessage = await this.prisma.feedbackMessage.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingMessage) {
      throw new NotFoundException('Feedback message not found');
    }

    const message = await this.prisma.feedbackMessage.update({
      where: { id },
      data: { status },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    return this.toAdminMessage(message);
  }

  private async enforceSubmitRateLimit(userId: string) {
    const key = `feedback:submit:${userId}`;
    const current = await this.redis.increment(key);

    if (current === 1) {
      await this.redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    if (current > RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException(
        '留言提交过于频繁，请稍后再试。',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private normalizeColor(color?: string) {
    return color?.trim() || DEFAULT_DANMAKU_COLOR;
  }

  private toPublicMessage(message: FeedbackMessage) {
    return {
      id: message.id,
      text: message.text,
      color: message.color,
      timestamp: message.createdAt.getTime(),
    };
  }

  private toAdminMessage(message: FeedbackWithAuthor) {
    return {
      id: message.id,
      text: message.text,
      color: message.color,
      status: message.status,
      timestamp: message.createdAt.getTime(),
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      author: message.author,
    };
  }
}
