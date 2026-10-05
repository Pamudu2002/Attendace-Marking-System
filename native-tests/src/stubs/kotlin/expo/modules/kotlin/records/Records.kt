package expo.modules.kotlin.records

// Minimal stand-ins for the Expo Modules record API so Records.kt compiles on the JVM.
interface Record

@Target(AnnotationTarget.PROPERTY, AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER)
annotation class Field(val key: String = "")
