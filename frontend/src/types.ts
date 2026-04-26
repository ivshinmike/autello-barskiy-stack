export type LeadBehavior = {
  time_on_page_seconds: number;
  button_clicks: Record<string, number>;
  cursor_hover_data: unknown;
  page_return_count: number;
  raw_metrics?: Record<string, unknown>;
};

export type WarmLeadForm = {
  first_name: string;
  last_name: string;
  middle_name: string;
  business_info: string;
  business_niche: string;
  company_size: string;
  task_volume: string;
  role_type: string;
  business_size: string;
  need_volume: string;
  result_deadline: string;
  task_type: string;
  product_interest: string;
  budget: string;
  contact_method: string;
  preferred_time: string;
  comments: string;
};

export type AdminDataRow = {
  id: number;
  services: { id?: string; title?: string; description?: string }[];
  budget_range_min: string | null;
  budget_range_max: string | null;
  extra_ui: Record<string, unknown> | null;
};
