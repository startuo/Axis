import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ArticleViewDashboardInterceptor } from '../dashboard/interceptors/article-view-dashboard.interceptor';
import { ArticlesService } from './articles.service';
import { PublicArticlesQueryDto } from './dto/public-articles-query.dto';

@Public()
@Controller('articles/public')
export class PublicArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  listArticles(@Query() query: PublicArticlesQueryDto) {
    return this.articlesService.listPublicArticles(query);
  }

  @UseInterceptors(ArticleViewDashboardInterceptor)
  @Get(':slug')
  getArticleDetail(@Param('slug') slug: string) {
    return this.articlesService.getPublishedArticleDetail(slug);
  }
}
