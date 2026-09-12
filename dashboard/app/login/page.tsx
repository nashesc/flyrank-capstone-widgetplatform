'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getOwnerSupabaseClient } from '@/lib/supabaseClient';

export default function LoginPage() {
  const pageRouter = useRouter();
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  async function signInOwner(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    setLoginError('');
    const { error: signInError } = await getOwnerSupabaseClient().auth.signInWithPassword({
      email: ownerEmail,
      password: ownerPassword,
    });
    if (signInError) {
      setLoginError(signInError.message);
      return;
    }
    pageRouter.push('/');
  }

  return (
    <main>
      <h1>Widget dashboard login</h1>
      <form onSubmit={signInOwner}>
        <label>
          Email
          <input
            type="email"
            value={ownerEmail}
            onChange={(changeEvent) => setOwnerEmail(changeEvent.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={ownerPassword}
            onChange={(changeEvent) => setOwnerPassword(changeEvent.target.value)}
            required
          />
        </label>
        <button type="submit">Sign in</button>
      </form>
      {loginError !== '' && <p className="error">{loginError}</p>}
    </main>
  );
}
