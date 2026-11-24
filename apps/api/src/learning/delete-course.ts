import type { Env } from '../env';
import { learningDb, checkDb } from './service';
import { LearningError } from './domain';

/**
 * Deletes a course with everything that belongs to it: its stored files in R2,
 * unfinished uploads, learner enrollments, media tickets and the course itself.
 * The Studio states how many learners will lose their enrollment; the delete
 * runs only if that number still matches, so a learner who enrolled in the
 * meantime is never removed unseen.
 */
export async function deleteCourse(env: Env, courseId: string, confirmedLearners: number) {
  const db = learningDb(env);
  const learners = await db
    .from('learning_enrollments')
    .select('user_id', { count: 'exact', head: true })
    .eq('course_id', courseId);
  checkDb(learners.error);
  if ((learners.count ?? 0) !== confirmedLearners)
    throw new LearningError(
      409,
      'تغيّر عدد المشتركين في الدورة. أعد فتح نافذة الحذف لترى العدد الحالي.',
    );
  const assets = await db
    .from('learning_assets')
    .select('object_key,upload_id,ready')
    .eq('course_id', courseId);
  checkDb(assets.error);
  const bucket = env.MEDIA;
  if (assets.data?.length && !bucket) throw new LearningError(503, 'خدمة الملفات غير متاحة الآن.');
  for (const asset of assets.data ?? []) {
    if (asset.ready) await bucket!.delete(asset.object_key);
    else if (asset.upload_id && bucket!.resumeMultipartUpload)
      await bucket!
        .resumeMultipartUpload(asset.object_key, asset.upload_id)
        .abort()
        .catch(() => undefined);
  }
  for (const table of ['learning_media_tickets', 'learning_enrollments', 'learning_assets']) {
    const removed = await db.from(table).delete().eq('course_id', courseId);
    checkDb(removed.error);
  }
  const removed = await db.from('learning_courses').delete().eq('id', courseId).select('id');
  checkDb(removed.error);
  if (!removed.data?.length) throw new LearningError(404, 'الدورة غير موجودة.');
  return { deleted: courseId };
}
