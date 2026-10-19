import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';

const Profile = () => {
  return (
    <Layout>
      <h2>Profile</h2>
      <Card className="p-4">
        <p><strong>Username:</strong> User</p>
        <p><strong>Email:</strong> user@example.com</p>
        <p><strong>Member Since:</strong> Oct 2023</p>
      </Card>
    </Layout>
  );
};

export default Profile;