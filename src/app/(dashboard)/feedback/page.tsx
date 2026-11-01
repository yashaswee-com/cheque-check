import { FeedbackCenter } from '@/features/feedback/components/feedback-center'
import { feedbackCategories } from '@/validators/feedback'

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>
}) {
  const requestedCategory = (await searchParams).category
  const category = Array.isArray(requestedCategory)
    ? requestedCategory[0]
    : requestedCategory
  const initialCategory = feedbackCategories.find(
    (candidate) => candidate === category,
  )
  return <FeedbackCenter initialCategory={initialCategory} />
}
