import { z } from 'zod'

const idSchema = z.string().min(1).max(100)
const textSchema = z.string().max(20_000)
const richTextSchema = z.string().max(50_000)

export const skillItemSchema = z.object({
  id: idSchema,
  html: richTextSchema,
  variant: z.enum(['summary', 'bullet']).default('bullet'),
})

export const experienceItemSchema = z.object({
  id: idSchema,
  title: textSchema,
  role: textSchema,
  date: textSchema,
  link: textSchema,
  separator: z.enum(['pipe', 'slash']),
  bullets: z.array(z.object({ id: idSchema, html: richTextSchema })).max(50),
})

export const sectionSchema = z.discriminatedUnion('kind', [
  z.object({
    id: idSchema,
    title: textSchema,
    kind: z.literal('skills'),
    items: z.array(skillItemSchema).max(100),
  }),
  z.object({
    id: idSchema,
    title: textSchema,
    kind: z.literal('experience'),
    items: z.array(experienceItemSchema).max(100),
  }),
])

export const resumeLayoutSchema = z.object({
  itemGap: z.number().min(-3).max(6).default(0),
  bulletGap: z.number().min(-3).max(6).default(0),
  summaryGap: z.number().min(-3).max(6).default(0),
  titleGap: z.number().min(-3).max(8).default(0),
  lineHeight: z.number().min(1.1).max(1.9).default(1.35),
  fontSize: z.number().min(9).max(12.5).default(10.75),
  sectionFontSize: z.number().min(9).max(18).default(15),
  itemFontSize: z.number().min(9).max(14).default(11.5),
  marginTop: z.number().min(0).max(30).default(14),
  marginBottom: z.number().min(0).max(30).default(14),
  marginLeft: z.number().min(0).max(30).default(14),
  marginRight: z.number().min(0).max(30).default(14),
  photoWidth: z.number().min(15).max(40).default(24),
  photoHeight: z.number().min(20).max(50).default(31),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: '主题色需为 #RRGGBB 格式' }).default('#1e4a3a'),
})

export type ResumeLayout = z.infer<typeof resumeLayoutSchema>

export const resumeLayoutDefaults: ResumeLayout = {
  itemGap: 0,
  bulletGap: 0,
  summaryGap: 0,
  titleGap: 0,
  lineHeight: 1.35,
  fontSize: 10.75,
  sectionFontSize: 15,
  itemFontSize: 11.5,
  marginTop: 14,
  marginBottom: 14,
  marginLeft: 14,
  marginRight: 14,
  photoWidth: 24,
  photoHeight: 31,
  accent: '#1e4a3a',
}

export const resumeBaseSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(200),
  updatedAt: z.string(),
  person: z.object({
    name: textSchema,
    role: textSchema,
    phone: textSchema,
    email: textSchema,
    wechat: textSchema,
    website: textSchema,
    birth: textSchema,
    city: textSchema.default(''),
    photo: z.string().max(5_000_000),
  }),
  education: z.object({
    graduation: textSchema,
    major: textSchema,
    school: textSchema,
  }),
  sections: z.array(sectionSchema).max(30),
  sectionGap: z.number().min(-3).max(12).default(0),
  layout: resumeLayoutSchema.default(resumeLayoutDefaults),
})

export const snapshotSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(100),
  createdAt: z.string(),
  data: resumeBaseSchema,
})

export const resumeSchema = resumeBaseSchema.extend({
  snapshots: z.array(snapshotSchema).max(100),
})

export const resumeListSchema = z.array(resumeSchema)

export type SkillItem = z.infer<typeof skillItemSchema>
export type ExperienceItem = z.infer<typeof experienceItemSchema>
export type ResumeSection = z.infer<typeof sectionSchema>
export type ResumeBase = z.infer<typeof resumeBaseSchema>
export type ResumeSnapshot = z.infer<typeof snapshotSchema>
export type ResumeDocument = z.infer<typeof resumeSchema>
