import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { changePassword } from '@/lib/auth-client';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import customSonner from '@/components/CustomSonner';

export default function ChangePassword({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = () => {
    setIsLoading(true);
    changePassword({
      currentPassword,
      newPassword: password,
      revokeOtherSessions: true,
      fetchOptions: {
        onSuccess: () => {
          setIsLoading(false);
          customSonner({
            text: 'Password changed successfully',
          });
        },
        onError: (error) => {
          setIsLoading(false);
          customSonner({
            variant: 'error',
            text: error.error.message || 'Failed to change password',
          });
        },
      },
    });
  };

  useEffect(() => {
    if (
      password !== confirmPassword &&
      password !== '' &&
      confirmPassword !== ''
    ) {
      setError('Passwords do not match.');
    } else {
      setError('');
    }
  }, [password, confirmPassword]);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className=' font-black'>Change password</DialogTitle>
          <DialogDescription>
            Other sessions will be revoked after changing your password.
          </DialogDescription>
          {error && <p className='text-red-500'>{error}</p>}
        </DialogHeader>
        <Input
          type='password'
          placeholder='Current password'
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={error ? 'border-red-500' : ''}
        />
        <Separator />
        <Input
          type='password'
          placeholder='New password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={error ? 'border-red-500' : ''}
        />
        <Input
          type='password'
          placeholder='Confirm password'
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={error ? 'border-red-500' : ''}
        />

        <Button
          onClick={handleChange}
          disabled={
            isLoading ||
            password === '' ||
            confirmPassword !== password ||
            currentPassword === ''
          }>
          {isLoading ? <Loader2 className='w-4 h-4 animate-spin' /> : 'Change'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
