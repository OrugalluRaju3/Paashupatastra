import { z } from "zod";

export const bankAccountInputSchema = z.object({
  accountHolderName: z.string().min(2).max(120),
  bankName: z.string().min(2).max(120),
  accountNumber: z.string().min(8).max(30),
  ifscCode: z.string().min(5).max(20),
  upiId: z.string().max(80).optional().nullable(),
  isPrimary: z.boolean().optional().default(true),
});

export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;

export const withdrawWalletSchema = z.object({
  /** Amount in paise; minimum ₹1 */
  amountInPaise: z.number().int().positive().min(100),
  bankAccountId: z.string().uuid().optional(),
});

export type WithdrawWalletInput = z.infer<typeof withdrawWalletSchema>;
