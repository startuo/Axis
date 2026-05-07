import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { SafeUser } from '../users/interfaces/safe-user.interface';
import { AdminFeedbackQueryDto } from './dto/admin-feedback-query.dto';
import { CreateFeedbackMessageDto } from './dto/create-feedback-message.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';
import { FeedbackService } from './feedback.service';

@Controller('feedback/messages')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  createMessage(
    @Body() dto: CreateFeedbackMessageDto,
    @CurrentUser() user: SafeUser,
  ) {
    return this.feedbackService.createMessage(dto, user);
  }

  @Public()
  @Get('public')
  listPublicMessages(
    @Query('limit', new DefaultValuePipe(80), ParseIntPipe) limit: number,
  ) {
    return this.feedbackService.listPublicMessages(limit);
  }

  @Roles(Role.ADMIN)
  @Get('admin')
  listAdminMessages(@Query() query: AdminFeedbackQueryDto) {
    return this.feedbackService.listAdminMessages(query);
  }

  @Roles(Role.ADMIN)
  @Patch('admin/:id/status')
  updateMessageStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFeedbackStatusDto,
  ) {
    return this.feedbackService.updateMessageStatus(id, dto.status);
  }
}
