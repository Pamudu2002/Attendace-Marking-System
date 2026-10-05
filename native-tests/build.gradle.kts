// JVM build of the apps' Kotlin NFC code (everything except the thin Expo bridge classes), compiled against
// Robolectric's android-all framework jar. Lets us compile-check and unit-test the APDU protocol without an
// Android SDK: ./gradlew test  (or `gradle test` with a local Gradle 8.x).
plugins {
  kotlin("jvm") version "2.1.21"
}

repositories {
  mavenCentral()
}

val androidAll = "org.robolectric:android-all:15-robolectric-13954326"

sourceSets {
  main {
    kotlin {
      srcDir("../apps/student/modules/attendance-hce/android/src/main/java")
      srcDir("../apps/host/modules/nfc-reader/android/src/main/java")
      srcDir("src/stubs/kotlin")
      // Expo Module subclasses need the full expo-modules-core + React Native toolchain.
      exclude("**/AttendanceHceModule.kt", "**/NfcReaderModule.kt")
    }
  }
}

dependencies {
  compileOnly(androidAll)
  testImplementation(androidAll)
  testImplementation(kotlin("test"))
  testImplementation("org.json:json:20240303")
}

tasks.test {
  useJUnitPlatform()
  testLogging { events("passed", "failed"); showStandardStreams = false; exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
