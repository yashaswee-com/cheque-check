import { z } from 'zod'

export const ChequeDetailsSchema = z.object({
  amount: z
    .number()
    .nullable()
    .describe('The cheque amount as a number (e.g., 1500.00).'),
  cheque_number: z
    .string()
    .nullable()
    .describe(
      'Strictly 6 contiguous digits found at the bottom lower left between narrow straight lines. Do not confuse with account number.',
    ),
  cheque_date: z
    .string()
    .nullable()
    .describe(
      'Date from the top-right boxes (originally DDMMYYYY). Convert and return strictly in YYYY-MM-DD format.',
    ),
  payee_name: z
    .string()
    .nullable()
    .describe('The name of the payee (after "Pay" or "To").'),
  account_number: z
    .string()
    .nullable()
    .describe(
      'The bank account number. Found near a block reading "A/c no". Avoid interpreting labels as numbers.',
    ),
  account_name: z
    .string()
    .nullable()
    .describe(
      'The name of the account holder, found below the signature line (bottom right). Can be multiple lines.',
    ),
  ifsc_code: z
    .string()
    .nullable()
    .describe(
      'The IFSC code (four letters, zero, six alphanumeric characters).',
    ),
  bank_name: z.string().nullable().describe('The name of the bank.'),
})
