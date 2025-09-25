import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

export default function SignUpForm({
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  handleSignUp,
}: {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  handleSignUp: () => void;
}) {
  return (
    <div className='flex flex-col gap-3 w-80 items-center'>
      <img src='/hoop.png' className='w-20 mb-5' />
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder='Email'
        className='h-11 border-2'
        autoFocus
      />
      <Input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder='Password'
        type='password'
        className='h-11 border-2'
      />
      <Input
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder='Confirm Password'
        type='password'
        onKeyDown={(e) => {
          if (e.key === 'Enter' && password === confirmPassword) {
            handleSignUp();
          }
        }}
        className={cn(
          password !== confirmPassword &&
            password &&
            confirmPassword &&
            'border-red-500',
          'h-11 border-2'
        )}
      />
      <Button
        className='cursor-pointer w-full font-bold mt-5'
        onClick={handleSignUp}
        disabled={!email || !password || !confirmPassword}>
        SignUp
      </Button>
    </div>
  );
}
