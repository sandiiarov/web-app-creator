import { z } from 'zod'

import { ProjectMetaSchema } from './project-snapshot.ts'

export const ProjectListSnapshotSchema = z.object({
  projects: z.array(ProjectMetaSchema),
  version: z.literal(2),
})

export type ProjectListSnapshot = z.infer<typeof ProjectListSnapshotSchema>
