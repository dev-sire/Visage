import { Helmet } from 'react-helmet';

const OGImage = () => {
    const ogImage = `${process.env.PUBLIC_URL}/ogImage.png`;

    return (
        <Helmet>
            <meta property="og:image" content={ogImage} />
        </Helmet>
    );
};

export default OGImage;