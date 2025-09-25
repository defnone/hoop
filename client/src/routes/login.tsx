import LoginForm from '@/components/Login/LoginForm';
import { authClient } from '@/lib/auth-client';
import customSonner from '@/components/CustomSonner';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { getHealth } from '@/lib/utils';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { signIn, useSession } = authClient;
  const { data: auth, isPending } = useSession();
  const navigate = useNavigate();

  const handleLogin = async () => {
    const { error } = await signIn.email({
      email: email,
      password: password,
    });
    if (error) {
      customSonner({
        variant: 'error',
        text: error.message || 'Login failed',
        delayDuration: 10000,
      });
    }
  };

  useEffect(() => {
    if (isPending) return;
    if (auth?.session) {
      navigate('/');
    }
  }, [isPending]);

  useEffect(() => {
    getHealth().then((data) => {
      if (data.message === 'First run') {
        navigate('/sign-up');
      }
    });
  }, []);

  return (
    <div className='flex flex-col items-center justify-center min-h-screen'>
      <div className='relative w-80 h-48 flex items-center'>
        <LoginForm
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          handleLogin={handleLogin}
        />
      </div>
    </div>
  );
}
