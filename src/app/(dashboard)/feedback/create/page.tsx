import { FeedbackCenter } from '@/features/feedback/components/feedback-center'
import { feedbackCategories } from '@/validators/feedback'

export default async function CreateFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>
}) {
  const requested = (await searchParams).category
  const category = Array.isArray(requested) ? requested[0] : requested
  return (
    <FeedbackCenter
      mode="create"
      initialCategory={feedbackCategories.find((item) => item === category)}
    />
  )
}
