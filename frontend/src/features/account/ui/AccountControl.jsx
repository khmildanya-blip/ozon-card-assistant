import React, { useEffect, useRef, useState } from 'react';
import { UserRound, X } from 'lucide-react';
import { request } from '../../../shared/api/client';
import { ACCOUNT_NAME_KEY as usernameKey } from '../../../shared/lib/draft-storage';

export function AccountControl() {
  const dialog = useRef(null);
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('access_token') ? localStorage.getItem(usernameKey) || '' : '';
    } catch {
      return '';
    }
  });
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [login, setLogin] = useState('');
  const registering = mode === 'register';

  useEffect(() => {
    if (mode === 'closed') dialog.current.close();
  }, [mode]);

  const open = () => {
    setMode(username ? 'profile' : 'login');
    setError('');
    setNotice('');
    dialog.current.showModal();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const password = new FormData(form).get('password');
    const credentials = { username: login.trim(), password };
    setError('');
    setNotice('');
    if (!credentials.username) return setError('Введите имя пользователя.');
    if (registering && new TextEncoder().encode(password).length > 72)
      return setError('Пароль слишком длинный. Введите более короткий пароль.');
    setBusy(true);
    try {
      if (registering) {
        await request('auth/register', credentials);
        setMode('login');
        setNotice('Аккаунт создан. Введите пароль, чтобы войти.');
        return;
      }
      const result = await request('auth/login', credentials);
      if (!result.access_token) throw new Error('Сервер не подтвердил вход.');
      localStorage.setItem(usernameKey, credentials.username);
      localStorage.setItem('access_token', result.access_token);
      setUsername(credentials.username);
      setMode('closed');
    } catch (failure) {
      setError(failure.message || 'Не удалось связаться с сервером.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="button button--secondary" onClick={open}>
        <UserRound size={16} /> Аккаунт
      </button>
      <dialog
        ref={dialog}
        className="account-dialog"
        aria-labelledby="account-heading"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="account-heading">
          <h2 id="account-heading">
            {mode === 'profile' ? 'Ваш аккаунт' : registering ? 'Регистрация' : 'Вход в аккаунт'}
          </h2>
          <button
            className="button button--ghost"
            type="button"
            aria-label="Закрыть"
            disabled={busy}
            onClick={() => dialog.current.close()}
          >
            <X size={20} />
          </button>
        </div>
        {mode === 'profile' ? (
          <>
            <p>
              Вы вошли как <strong>{username}</strong>.
            </p>
            <p className="account-help">У этого аккаунта свой черновик в этом браузере.</p>
            <button
              className="button button--secondary"
              onClick={() => {
                localStorage.removeItem('access_token');
                localStorage.removeItem(usernameKey);
                setUsername('');
                setMode('closed');
              }}
            >
              Выйти
            </button>
          </>
        ) : (
          <>
            <p className="account-help">
              Карточки можно создавать без входа. Аккаунт позволяет хранить отдельный черновик в
              этом браузере.
            </p>
            <form key={mode} onSubmit={submit}>
              <label htmlFor="account-login">Имя пользователя</label>
              <input
                id="account-login"
                className="input"
                value={login}
                required
                maxLength={255}
                autoComplete="username"
                disabled={busy}
                onChange={(event) => setLogin(event.target.value)}
              />
              <label htmlFor="account-password">Пароль</label>
              <input
                id="account-password"
                name="password"
                className="input"
                type="password"
                required
                autoComplete={registering ? 'new-password' : 'current-password'}
                disabled={busy}
              />
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
              {notice && <p role="status">{notice}</p>}
              <button className="button button--primary" type="submit" disabled={busy}>
                {busy ? 'Подождите…' : registering ? 'Создать аккаунт' : 'Войти'}
              </button>
              <button
                className="button button--ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setError('');
                  setNotice('');
                  setMode(registering ? 'login' : 'register');
                }}
              >
                {registering ? 'Уже есть аккаунт? Войти' : 'Зарегистрироваться'}
              </button>
            </form>
          </>
        )}
      </dialog>
    </>
  );
}
