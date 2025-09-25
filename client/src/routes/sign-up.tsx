import { authClient } from '@/lib/auth-client';
import customSonner from '@/components/CustomSonner';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import SignUpForm from '@/components/SignUp/SignUpForm';
import { getHealth } from '@/lib/utils';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { signUp, useSession } = authClient;
  const { data: auth, isPending } = useSession();
  const navigate = useNavigate();

  const handleSignUp = async () => {
    const { error } = await signUp.email({
      name: '',
      email: email,
      password: password,
    });
    if (error) {
      customSonner({
        variant: 'error',
        text: error.message || 'Sign up failed',
        delayDuration: 10000,
      });
    } else {
      getHealth().then((data) => {
        if (data.message === 'OK') {
          window.location.href = '/settings';
        }
      });
    }
  };

  useEffect(() => {
    if (isPending) return;
    if (auth?.session) {
      navigate('/');
    }
  }, [isPending]);

  return (
    <div className='flex flex-col items-center justify-center min-h-screen'>
      <div className='relative w-80 h-48 flex items-center'>
        <SignUpForm
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          handleSignUp={handleSignUp}
        />
      </div>
    </div>
  );
}
