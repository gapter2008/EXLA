import { z } from "zod";

export const brandFitItemSchema = z.object({
  category: z.string(),
  reasoning: z.string().optional(),
});

export const creatorAiProfileOutputSchema = z.object({
  headline: z.string().min(1).max(120),
  bio: z.string().max(600),
  niches: z.array(z.string()).max(5),
  themes: z.array(z.string()).max(8),
  content_formats: z.array(z.string()).max(6),
  style_descriptors: z.array(z.string()).max(6),
  audience_summary: z.string().max(300),
  brand_fit: z.array(brandFitItemSchema).max(8),
  suggested_collab_types: z.array(z.string()).max(6),
  confidence: z.number().min(0).max(1),
  evidence: z.object({
    top_video_titles: z.array(z.string()).optional(),
    recurring_keywords: z.array(z.string()).optional(),
    stats_used: z.string().optional(),
  }).optional(),
});

export type CreatorAiProfileOutput = z.infer<typeof creatorAiProfileOutputSchema>;
