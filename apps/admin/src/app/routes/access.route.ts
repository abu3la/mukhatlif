import { redirect } from 'react-router-dom';
import { adminPaths } from '@/application';

export function loader() {
  return redirect(adminPaths.roles);
}

export function Component() {
  return null;
}
