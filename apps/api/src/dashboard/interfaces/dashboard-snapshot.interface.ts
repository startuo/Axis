export interface DashboardSnapshotHotArticle {
  articleId: string;
  slug: string;
  title: string;
  todayViewCount: number;
  totalViewCount: number;
}

export interface DashboardSnapshot {
  onlineVisitors: number;
  todayPageViews: number;
  todayUniqueVisitors: number;
  todayNewReadCount: number;
  hotArticles: DashboardSnapshotHotArticle[];
  generatedAt: string;
}
