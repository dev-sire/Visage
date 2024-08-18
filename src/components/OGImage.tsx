import { Helmet } from 'react-helmet';

const OGImage = () => {
    const ogImage = `https://visageshare.vercel.app/ogImage.png`;

    return (
        <Helmet>
            <meta property="og:image" content={ogImage} />
        </Helmet>
    );
};

export default OGImage;