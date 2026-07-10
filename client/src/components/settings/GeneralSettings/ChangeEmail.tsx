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
import { changeEmail } from '@/lib/auth-client';
import { Loader2 } from 'lucide-react';
import { signOut } from '@/lib/auth-client';
import customSonner from '@/components/CustomSonner';

export default function ChangeEmail({
  children,
}: {
  children: React.ReactNode;
}) {
  const [email, setEmail] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleChange = () => {
    startTransition(async () => {
      await changeEmail({
        newEmail: email,
        fetchOptions: {
          onSuccess: () => {
            customSonner({
              text: 'Email changed successfully',
            });
            void signOut();
          },
          onError: (error) => {
            customSonner({
              variant: 'error',
              text: error.error.message || 'Failed to change email',
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
          <DialogTitle className=' font-black'>Change email</DialogTitle>
          <DialogDescription>
            You can use any email address you want, it will only be used for
            login purposes. You will need to login again after changing your
            email.
          </DialogDescription>
        </DialogHeader>
        <Input
          type='email'
          placeholder='New email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Button onClick={handleChange} disabled={isPending || email === ''}>
          {isPending ? <Loader2 className='w-4 h-4 animate-spin' /> : 'Change'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
