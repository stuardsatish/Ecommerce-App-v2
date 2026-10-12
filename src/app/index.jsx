import { Redirect } from 'expo-router';
import { useSelector } from 'react-redux';

export default function RootIndex() {
  const user = useSelector((state) => state.user.user);

  return <Redirect href={user ? '/products' : '/login'} />;
}