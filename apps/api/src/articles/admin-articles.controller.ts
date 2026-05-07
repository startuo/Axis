import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { SafeUser } from '../users/interfaces/safe-user.interface';
import { ArticlesService } from './articles.service';
import { AdminArticlesQueryDto } from './dto/admin-articles-query.dto';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

@Roles(Role.ADMIN)
@Controller('articles/admin')
export class AdminArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  listArticles(@Query() query: AdminArticlesQueryDto) {
    return this.articlesService.listAdminArticles(query);
  }

  @Get(':id')
  getArticleById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.articlesService.getAdminArticleById(id);
  }

  @Post()
  createArticle(@Body() dto: CreateArticleDto, @CurrentUser() user: SafeUser) {
    return this.articlesService.createArticle(dto, user);
  }

  @Patch(':id')
  updateArticle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articlesService.updateArticle(id, dto);
  }

  @Delete(':id')
  deleteArticle(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.articlesService.deleteArticle(id);
  }
}
