import { FeedbackCenter } from '@/features/feedback/components/feedback-center'
import { feedbackCategories } from '@/validators/feedback'
import { redirect } from 'next/navigation'

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
  if (initialCategory) redirect(`/feedback/create?category=${initialCategory}`)
  return <FeedbackCenter />
}
