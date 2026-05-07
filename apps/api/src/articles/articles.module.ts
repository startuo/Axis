import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AdminArticlesController } from './admin-articles.controller';
import { ArticleViewsService } from './article-views.service';
import { ArticlesService } from './articles.service';
import { PublicArticlesController } from './public-articles.controller';

@Module({
  imports: [DashboardModule],
  controllers: [PublicArticlesController, AdminArticlesController],
  providers: [ArticlesService, ArticleViewsService],
  exports: [ArticlesService, ArticleViewsService],
})
export class ArticlesModule {}
