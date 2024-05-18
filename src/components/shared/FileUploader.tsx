import { useCallback, useState } from 'react'
import { useDropzone, FileWithPath } from 'react-dropzone'
import { Button } from '../ui/button'
import { File } from 'buffer'

type FileUploaderProps = {
  fieldChange: (files: File[]) => void;
  mediaUrl: string;
}

const FileUploader = ({ fieldChange, mediaUrl }: FileUploaderProps) => {
    const [file, setFile] = useState<File[]>([])
    const [fileUrl, setFileUrl] = useState(mediaUrl)

    const onDrop = useCallback(
      (acceptedFiles: FileWithPath[]) => {
        setFile(acceptedFiles as unknown as File[]);
        fieldChange(acceptedFiles as unknown as File[]);
        setFileUrl(URL.createObjectURL(acceptedFiles[0]));
      },
      [file]
    );
    const {getRootProps, getInputProps} = useDropzone({onDrop, accept: {
      'image/*' : ['.png', '.jpeg', '.jpg', '.svg'],
    }})
  return (
      <div {...getRootProps()} className="flex flex-center flex-col bg-dark-3 rounded-xl cursor-pointer">
          <input {...getInputProps()} />
          {
              fileUrl ? (
                <>
                  <div className="flex flex-1 justify-center w-full p-5">
                    <img src={fileUrl} className="file_uploader-img" alt="UploadedImage" />
                  </div>
                  <p className="file_uploader-label">Click or drag photo to replace</p>
                </>
              ) : (
                <div className="file_uploader-box">
                    <img src="/assets/icons/file-upload.svg" width={96} height={77} alt="fileUploader" />
                    <h3 className="base-medium text-light-2 mb-2 mt-6">Drag Photo Here</h3>
                    <p className="text-light-4 small-regular mb-6">SVG, PNG, JPG</p>
                    <Button className="shad-button_dark_4">Select From Device</Button>
                </div>
              )
          }
      </div>
  )
}

export default FileUploader