import { REGEXP_ONLY_DIGITS } from 'input-otp';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

export default function OtpForm({
  otp,
  setOtp,
}: {
  otp: string;
  setOtp: (value: string) => void;
}) {
  return (
    <div className='flex flex-col gap-4 items-center w-80'>
      <InputOTP
        className='mx-auto flex'
        value={otp}
        onChange={(e) => setOtp(e)}
        maxLength={6}
        autoFocus
        pattern={REGEXP_ONLY_DIGITS}>
        <InputOTPGroup>
          <InputOTPSlot
            className='w-12 h-12 text-xl'
            index={0}
          />
          <InputOTPSlot
            className='w-12 h-12 text-2xl'
            index={1}
          />
          <InputOTPSlot
            className='w-12 h-12 text-2xl'
            index={2}
          />
          <InputOTPSlot
            className='w-12 h-12 text-2xl'
            index={3}
          />
          <InputOTPSlot
            className='w-12 h-12 text-2xl'
            index={4}
          />
          <InputOTPSlot
            className='w-12 h-12 text-2xl'
            index={5}
          />
        </InputOTPGroup>
      </InputOTP>

      <div className='text-sm text-muted-foreground'>
        Enter the 6-digit code sent to your email.
      </div>
    </div>
  );
}
