declare module 'virtual:gamestr-manifest-validator' {
  interface ValidationError { instancePath: string; message?: string }
  interface ManifestValidator {
    (value: unknown): boolean
    errors?: ValidationError[] | null
  }
  const validate: ManifestValidator
  export default validate
}
