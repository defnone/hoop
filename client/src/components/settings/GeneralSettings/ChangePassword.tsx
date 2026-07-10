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
import { useState, useTransition } from 'react';
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
  const [isPending, startTransition] = useTransition();
  const error =
    password !== confirmPassword && password !== '' && confirmPassword !== ''
      ? 'Passwords do not match.'
      : '';

  const handleChange = () => {
    startTransition(async () => {
      await changePassword({
        currentPassword,
        newPassword: password,
        revokeOtherSessions: true,
        fetchOptions: {
          onSuccess: () => {
            customSonner({
              text: 'Password changed successfully',
            });
          },
          onError: (error) => {
            customSonner({
              variant: 'error',
              text: error.error.message || 'Failed to change password',
            });
          },
        },
      });
    });
  };

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
            isPending ||
            password === '' ||
            confirmPassword !== password ||
            currentPassword === ''
          }
        >
          {isPending ? <Loader2 className='w-4 h-4 animate-spin' /> : 'Change'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
